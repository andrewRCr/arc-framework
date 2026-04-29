# Plan: Session-Operational Flow (sibling WU to Interlock Foundation)

## Problem / Motivation

[ADR-016][adr-016] establishes the interlock model: a linear autonomy stack (task → commit → push → integrate) with
invariant endpoints and configurable middle interlocks, plus handoff as an orthogonal human-invoked ceremony. The
[Interlock Foundation WU][prd-foundation] lands the constitutional frame, the configuration surface, and the
rollback dev-rule. This sibling WU implements the **autonomy-mode behavior** (auto-commit, auto-push) and the
**metadata-state foundation** for downstream lifecycle consumers, against the frame Interlock Foundation establishes.

Without this WU, the Interlock Foundation ships the frame but adopters can't configure their sessions to use the
configurable autonomy modes. The frame becomes scaffolding without an inhabitant.

This plan describes WU-B in the pre-approved split. WU-A (Interlock Foundation) is upstream; this work proceeds
after WU-A's validation window completes.

## Scope

### In scope

**Auto-commit mode.** Skill/workflow implementation; interaction with `prepare-commits` (simple-path-only auto-
commit, complexity bumps to manual-with-prompt); atomicity-preservation under autonomy. Contributor role
auto-commit stages code only — no project-level status-file updates, matching the role-separation rule per
[DEV-RULES.ARC][dev-rules-arc] § Commit Discipline "Contributor override" (contributor status files are
gitignored and updated at handoff regardless of mode).

**Auto-push mode.** Auto-push-at-handoff implementation — push fires inside the handoff ceremony when configured.
Mid-session push remains explicit-ask only. Push ordering invariant from [Interlock Foundation][prd-foundation]
applies: worktree-push lands before notes-push.

**Deferred-review × auto-commit interaction.** Resolved per § Design Decisions: safe-accumulate (auto-commit does
not fire per task within a deferred range; tasks accumulate for user review on return). Per-task auto-commit
inside a deferred range available only via explicit instruction at deferral time.

**Session-init load-set adapts to autonomy config.** When auto-commit is configured, session-init eagerly loads
commit-format and commit-context-format methods to prevent per-cycle method-load overhead in a hot path. These
methods today load via the arc-commit skill; auto-commit fires between tasks without invoking the skill, so
session-init becomes the load-trigger.

**Handoff-interior toggle consumers.** Whatever toggle keys this WU's auto-push behavior introduces (likely
`push.timing: manual | on-handoff` or equivalent) follow the handoff-interior toggle pattern documented in
Interlock Foundation. Consumer-plan toggles ([plan-user-sync-ux][plan-sync] etc.) are not in this WU's scope —
they ship in those plans.

**Metadata-state foundation for WU lifecycle.** Constitutional foundation that downstream lifecycle plans
(particularly [plan-agile-wu-lifecycle][plan-awl]) implement against:

- `**State:**` enum: `Planning | In Progress | Complete | Paused | Superseded`. `Planning` was introduced by
  Interlock Foundation; remaining values land here as the execution/lifecycle states matching the
  agile-wu-lifecycle proposal
- New optional `**Integration:**` field carries transient workflow position during the integration window:
  `PR review | Review fixes | Ready to merge | Merged`. Cleared at sweep
- Sweep eligibility: `State: Complete + Integration: Merged`. After sweep, file is removed from `active/` —
  location reflects state without an `Archived` value
- Sweep cadence is configurable: default sweep-as-you-go (archive ops in integration PR as separate commit per
  multi-commit-PR norms), opt-in deferred (archive batched with next-WU planning or standalone). Config key TBD
  (likely `archive.cadence: with-integration | deferred | manual`)
- Session-init orientation surfaces `**Integration:**` when present. The field slots naturally into the existing
  `## Active Work` partial-read pattern of "optional fields when present" (alongside Interrupts / Paused At /
  Superseded By); orientation summary highlights it for active-work WUs in the integration window. Implementation
  detail for [plan-agile-wu-lifecycle][plan-awl] item 7a, captured here so it doesn't get lost.

**arc-commit skill preservation policy.** Skill remains user-invocable in both manual and auto modes. Under auto
mode, the skill provides ad-hoc commit capability for non-task work mid-session and for recovery after auto-commit
fallback. Auto-commit's internal logic mirrors the skill's simple-path branch and delegates to `prepare-commits`
when atomicity-test triggers fire (multi-concern, interleaved files, accumulated multi-session work) — at which
point the agent stops and prompts rather than silently invoking complex logic.

**Strategy doc cascade updates** (sibling-WU additional cascade beyond Interlock Foundation's minimal cascade):
[`strategy-team-coordination`][strategy-team] (autonomy-mode-aware coordination guidance);
[`strategy-session-operations`][strategy-session] (autonomy-config-aware load-set, deferred-review × auto-commit
interaction); others as surfaced.

**Test scope.** Each phase ships tests appropriate to its surface: skill/workflow changes via vitest unit tests;
auto-commit mode via integration tests covering structured-prompt parsing, deferred-review interaction, and
failure-mode fallback paths; metadata-state additions via structural CHECKs on template-status.

### Out of scope — deferred to upstream/sibling plans

- **Constitutional foundation, status-file timing rule, planning-session active surface, configuration surface
  (incl. composite handoff probe and handoff-interior toggle pattern), structured task-completion prompt as
  base behavior, rollback dev-rule** — all in [Interlock Foundation][prd-foundation] (upstream WU-A).
- **Worktree push + notes push pairing implementation** — [plan-user-sync-ux][plan-sync] consumes the
  handoff-interior toggle pattern + push-ordering invariant to solve the `user.sync_push: always` incoherence.
- **Quality-gate hook placement at autonomy-stack junctions** — [plan-quality-gate-hooks][plan-hooks] attaches
  validation gates to the commit / push / integration junctions Interlock Foundation formalizes.
- **Multi-worktree mechanics and spawn-vs-continue semantics** — [plan-worktree-foundation][plan-wf] consumes
  the parallel-session framing here and the metadata-state foundation from this WU.
- **Concurrent-work conventions consuming configurable autonomy** — [plan-concurrent-work-conventions][plan-cwc].
- **Integration-workflow rewrites and tier-aware sweep ceremony** — [plan-agile-wu-lifecycle][plan-awl]
  implements the metadata-state foundation against tier-aware lifecycle workflows.
- **Branch-gone resolution under auto modes** — non-applicable. Branch/worktree removal stays manual under all
  autonomy levels per [ADR-016][adr-016].
- **Promotion of rollback dev-rule to a `/arc-rollback` skill** — candidate future WU if dogfooding during this
  WU's auto-cascade exercise shows demand. Not in scope here.

## Design Decisions

The cross-cutting design decisions for the interlock model (vocabulary precedent, status-file timing tradeoff,
push-timing reasoning, structured-prompt anchoring, planning-session active surface, push ordering) live in
[ADR-016][adr-016] and the [Interlock Foundation PRD][prd-foundation]. Decisions specific to this WU:

### Deferred-review × auto-commit: safe-accumulate

When a user defers review for a range of tasks (e.g., "work through tasks 5.2-5.4 while I'm away"), auto-commit
does NOT fire per task within the range. Tasks accumulate; user reviews and approves the accumulated work as a
unit when they return. This preserves the spirit of deferred review — user is away, no per-task approval available,
autonomous commits without review violate the interlock model.

Per-task auto-commit inside a deferred range is available only via explicit instruction at deferral time
(e.g., "work through 5.2-5.4 with auto-commit per task while I'm away"). Default is safe-accumulate.

### Metadata-state model for WU lifecycle

The State + Integration field model is documented in § Scope above. Phase 3 of this WU delivers the foundation;
[plan-agile-wu-lifecycle][plan-awl] implements the tier-aware lifecycle workflows against it.

### Rollback scope reaffirmed: session-local

The rollback protocol (dev-rule shipped in Interlock Foundation) is session-scoped. Rollback in one session
undoes the cascade in *that* session — it doesn't reach into other sessions' commits or pushes. Under parallel
sessions, each session manages its own reversibility independently. This WU's auto-cascade behaviors honor that
scope; promotion to skill (if it happens) preserves the scope.

### arc-commit skill stays user-invocable

The arc-commit skill remains a first-class user-invocable surface in both manual and auto modes. Under auto-commit,
the skill is the ad-hoc commit path for non-task work mid-session and for recovery after auto-commit fallback to
manual. Auto-commit's internal logic mirrors the skill's simple-path branch; complexity bumps to manual-with-prompt
rather than silent invocation of `prepare-commits`.

## Unknowns and Assumptions

**Open design decisions (PRD-time resolution):**

- Final config keys for auto-push: `push.timing` shape (likely `manual | on-handoff` or boolean toggle) and
  default value. PRD finalizes naming and enum.
- Final field/value names for the State + Integration field model — § Scope establishes the conceptual shape;
  PRD finalizes field labels and enum values.
- `archive.cadence` key shape (`with-integration | deferred | manual` per § Scope). PRD finalizes naming.

**Migration and validation details (PRD-time resolution):**

- Migration defaults for existing in-flight status files at WU activation: `**Integration:**` field initialized
  empty (transient field, populated only during integration window); `State:` migration as needed at next
  status-file touch (typically next handoff), not mass sweep.
- Failure-mode taxonomy under auto-commit / auto-push (PRD-detail). Modes to enumerate at PRD: pre-commit hook
  failure, T1/T2 quality-gate failure post-fire, network failure mid-push, partial multi-commit-cascade failure
  (some commits land, push fails). Connects to the rollback dev-rule shipped in Interlock Foundation —
  failure recovery uses that protocol for the affected cascade.

**Assumptions to validate during PRD:**

- The Interlock Foundation frame supports this WU's scope without revisits — verified during the validation
  window between WU-A integration and this WU's activation.
- The downstream consumer plans (sync UX, hooks, worktree-foundation, concurrent-work-conventions, agile-WU-
  lifecycle) can consume this WU's outputs without requiring structural changes to their own scope beyond what's
  already captured in their reshape notes.

## Scope Estimate

**Medium-large.** Implementation-heavy WU — auto-commit and auto-push behaviors plus the metadata-state
foundation. Doc edits are smaller than WU-A; the implementation surface is real (skills, workflows, schema
changes, integration tests).

### Phases (provisional)

1. **Auto-commit mode** — skill/workflow implementation, `prepare-commits` simple-path-only integration with
   complexity-bumps-to-manual fallback, deferred-review × auto-commit safe-accumulate resolution, arc-commit
   skill preservation as user-invocable surface, session-init load-set autonomy-config-aware adaptation
   (eager-load commit-format and commit-context-format methods when auto-commit configured), tests.
2. **Auto-push mode + handoff-interior toggle keys** — auto-push-at-handoff configurability (push fires inside
   the handoff ceremony when configured); mid-session push remains explicit-ask only. Whatever new
   handoff-interior toggle keys this WU's auto-push behavior introduces follow the pattern from Interlock
   Foundation. Workflow integration points, defaults, tests.
3. **Strategy cascade + metadata-state foundation + integration specs** — Comprehensive cascade update (autonomy-
   mode-aware coordination guidance, autonomy-config-aware load-set documentation); metadata-state foundation
   (State enum extension + Integration field model + sweep cadence config) for downstream lifecycle plans to
   consume; integration specs for upstream plans; verification.

Phases 1 and 2 are relatively independent (auto-commit and auto-push touch different operational surfaces);
Phase 3 lands after both.

### Dependencies

- **[Interlock Foundation][prd-foundation] integrated and validated** — the constitutional frame, configuration
  surface, structured-prompt format, composite handoff probe, handoff-interior toggle pattern, and rollback
  dev-rule must all be live and dogfooded before this WU activates.
- **No dependency on downstream consumer plans** — they consume this frame, not the reverse.

### Downstream consumption

- **[plan-user-sync-ux][plan-sync]** — smallest consumer; reshapes to consume the handoff-interior toggle
  pattern + composite handoff probe + push-ordering invariant from Interlock Foundation. May ship in parallel
  with this WU's Phase 2 once the auto-push framework is settled.
- **[plan-quality-gate-hooks][plan-hooks]** — attaches validation gates to the same architectural junctions
  this WU's auto-modes operate at; consumes the configuration surface (Interlock Foundation) for per-junction
  hook configuration.
- **[plan-worktree-foundation][plan-wf]** — consumes the parallel-session concurrency model framing
  (Interlock Foundation Phase 1) and the metadata-state foundation (this WU's Phase 3). Spawn-vs-continue
  semantics build on the framing.
- **[plan-concurrent-work-conventions][plan-cwc]** — consumes configurable autonomy (this WU) as the mechanism
  for reducing approval ceremony under multi-session load. Can ship in parallel once Phase 1 lands.
- **[plan-agile-wu-lifecycle][plan-awl]** — consumes the metadata-state foundation (this WU's Phase 3) for
  tier-aware integration/sweep workflow rewrites.

### Scheduling

**After Interlock Foundation validation window.** Sequencing rationale:

- Interlock Foundation's frame must be dogfooded through self-host's own session-operational flow for a defined
  validation window (target: at least three sessions exercising the new status-file timing rule, the
  planning-session active surface, the structured-prompt format, and the configuration surface) before this
  WU activates. The validation window de-risks the frame against revisits this WU would have to absorb.
- Phases 1-2 (auto-commit, auto-push) can run alongside downstream consumer plans' early phases — they don't
  block consumers of the frame itself, except for the metadata-state foundation dependency.
- Phase 3 (metadata-state foundation) must land before [plan-agile-wu-lifecycle][plan-awl]'s integration-workflow
  restructure begins.

---

[adr-016]: ../../reference/adr/adr-016-configurable-autonomy-interlocks-for-session-operations.md
[prd-foundation]: prd-interlock-foundation.md
[dev-rules-arc]: ../../reference/constitution/DEV-RULES.ARC.md
[strategy-team]: ../../reference/strategies/arc/strategy-team-coordination.md
[strategy-session]: ../../reference/strategies/arc/strategy-session-operations.md
[plan-sync]: plan-user-sync-ux.md
[plan-hooks]: plan-quality-gate-hooks.md
[plan-wf]: plan-worktree-foundation.md
[plan-awl]: plan-agile-wu-lifecycle.md
[plan-cwc]: ../feature/plan-concurrent-work-conventions.md
