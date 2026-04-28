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

**Status-file timing rule.** All status-file updates fire at session-handoff commits or workflow-ceremony commits
(activate / integrate / sweep / deactivate / PRD generation / planning lifecycle operations). Task-completion code
commits never bundle status-file updates. Supersedes the current [DEV-RULES.ARC][dev-rules-arc] § Commit Discipline
"Work status accuracy" provision. Workflow updates: `3_process-task-loop.md` (task-completion no longer touches
status); `session-handoff.md` (status update is the handoff commit); lifecycle workflows bundle status updates
into their own ceremony commits. Cascade to strategy docs ([`strategy-team-coordination`][strategy-team],
[`strategy-session-operations`][strategy-session]).

**Planning-session active surface.** Today, `activate-planning-branch.md` creates a branch but no status file —
planning sessions resolve as `active.resolution: "none"` at session-init, with the project pointer carried only
in (gitignored) SESSION-NOTES. Fix: `activate-planning-branch.md` creates a status file at activation
(State: Planning, Task List: [none], optional `**Spec:**` field pointing at plan-doc / external tracker / nothing
for free-form planning); `integrate-planning-branch.md` handles status-file disposition (graduated → keep and
transition; shelved → remove); probe sessionType inference reads `State: Planning` for primary planning detection
with branch-pattern fallback retained for orphan cases.

This work surfaces the `**Spec:**` field introduction here (carved from [plan-agile-wu-lifecycle][plan-awl]
scope) — generalized pointer with values: `plan-{name}.md` (planning), `prd-{name}.md` (standard WU),
`tasks-{name}.md#scope` (quick WU under arc-in-git), external URL (external tracker), omitted (atomic /
free-form). Tier-specific value semantics and validation remain in agile-wu-lifecycle scope.

**Plan-doc location during planning (arc-in-git only).** When the planning branch's focused plan-doc lives in
`backlog/{category}/plan-{name}.md`, `activate-planning-branch.md` does `git mv` to `active/{category}/`,
keeping the plan-doc as live reference material throughout planning. `integrate-planning-branch.md` disposition:
graduated (PRD generated) → `git rm` the plan-doc (subsumed by PRD); shelved (no PRD generated, refinement edits
preserved) → `git mv` back to `backlog/{category}/`. Under pm.mode: external / none, no automatic plan-doc
movement — only the status file is universal across modes; user manages plan-doc location ad-hoc.

**Configuration surface.** Autonomy axis naming, value enum, schema validation, default values (matching current
behavior), per-developer override mechanism. Handoff-interior toggle framework for configurable actions inside handoff.

**Approval-signal vocabulary.** Signal classes per gate, concrete phrase/command catalog, disambiguation rules
(approval vs. iteration). Formalizes what counts as "approval" at each gate level. Specifies the "approved"
grammar with strict disambiguation per § Design Decisions.

**Auto-commit mode.** Skill/workflow implementation; interaction with `prepare-commits` (simple-path-only auto-
commit, complexity bumps to manual-with-prompt); atomicity-preservation under autonomy. Contributor role
auto-commit stages code only — no project-level status-file updates, matching the role-separation rule per
[DEV-RULES.ARC][dev-rules-arc] § Commit Discipline "Contributor override" (contributor status files are
gitignored and updated at handoff regardless of mode).

**Auto-push mode.** Auto-push-at-handoff configurability — push fires inside the handoff ceremony when configured.
Mid-session push remains explicit-ask only (natural language, no canonical phrase or skill required); push is never
auto-fired per commit. Push-gate mechanics, prerequisites, interaction with auto-commit mode per § Design Decisions.

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

- `**State:**` enum: `Planning | In Progress | Complete | Paused | Superseded`. `Planning` introduced by the
  planning-session active surface work above; remaining values are execution/lifecycle states matching the
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

**Strategy doc cascade updates.** [`strategy-team-coordination`][strategy-team] (per-commit status-advance language
becomes stale); [`strategy-session-operations`][strategy-session] (session-state timing, autonomy-config-aware
load-set); others as surfaced.

**Test scope.** Each phase ships tests appropriate to its surface: workflow updates verified via self-host
dogfooding plus structural CHECK additions where applicable; CLI/skill changes via vitest unit tests;
configuration parsing via unit tests; auto-commit mode via integration tests covering grammar parsing,
deferred-review interaction, and failure-mode fallback paths.

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

## Open Design Choices

Multi-option design forks awaiting PRD-time resolution. Most alternatives were resolved at the [ADR-016][adr-016]
level (see that ADR's Alternatives Considered).

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

## Design Decisions

### Push timing: explicit ask, with auto-at-handoff opt-in

Push always requires explicit user request — natural-language ("push this", "push to origin") in mid-session, or
the handoff invocation when auto-push-at-handoff is configured. There is no per-commit auto-push mode and no
canonical push phrase or skill. The "distinct signal" requirement from [ADR-016][adr-016] is satisfied by
natural-language explicitness: a push request is lexically distinct from `approved` and unambiguously scoped to
push intent.

Auto-push-at-handoff is the only "automatic" path. When configured, push fires inside the handoff ceremony when
handoff is invoked. Three reasons this is the right shape for automated push:

- **Pairing.** Worktree-push and notes-push need to land at the same gate; handoff is the natural pairing point per
  the handoff-interior toggle framework.
- **Stakes asymmetry per [ADR-016][adr-016].** Push is external-visible and less reversible than commit;
  concentrating into deliberate ceremony reduces accidental cascade surface.
- **Concurrent-session safety.** Under parallel sessions (per § Concurrency Model), multiple sessions writing to
  shared `refs/notes/arc/user/{identity}` near-simultaneously creates ref-update races. Handoff-only concentrates
  writes into deliberate single events; per-commit auto-push would compound race surface linearly with commit cadence.

Config likely `push.timing: manual | on-handoff` (or equivalent boolean toggle). PRD finalizes shape.

### Status-file updates at handoff and ceremony commits only

Today's rule ([DEV-RULES.ARC][dev-rules-arc] § Commit Discipline "Work status accuracy") bundles status-file
updates into every task-completion commit. This violates atomicity (one commit carries code/doc changes plus
project-pointer state — two logical concerns) and creates per-task token + time churn that compounds under
multi-task sessions and auto-commit mode.

New rule: status-file updates fire only at (a) session-handoff commits and (b) workflow-ceremony commits
(activate / integrate / sweep / deactivate / PRD generation / planning lifecycle operations). Task-completion
code commits never touch the status file.

Tradeoff: handoff produces a dedicated `chore(status): handoff …` commit not bundled with code. This isn't
"dangling" — it's a clear session-boundary marker, naturally atomic, conventional-commit-friendly, and visible
in PR history as the explicit handoff point. Reviewers benefit (code commits stay focused on code; status
commits stay focused on pointer state). Auto-commit benefits (auto-fire scope is code-only, never has to
maintain status consistency mid-stream). The rule is simpler than the prior "shape-vs-rotation field split"
framing because it removes the per-commit shape/rotation judgment call — workflow-ceremony commits become the
only shape-change vector under the gate model.

Workflow-ceremony commits include the status update IN their own commit (not a separate dangling commit), since
the ceremony operation's "one logical change" includes the metadata transition (e.g., PRD generation = creating
PRD file + updating status `**Spec:**` to point at it = one logical change).

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

### Planning-session active surface = status file (not plan-doc)

Plan-docs are reference material subsumed by PRDs and retired at WU graduation; status files are the universal
project-pointer artifact. The initial impulse to make plan-docs the planning-phase active marker would have
required pointer-field injection on a doc that exists for different reasons. Cleaner: `activate-planning-branch`
creates a status file at planning activation, mirroring how `activate-work-unit` creates one at WU activation.
Plan-doc remains independently optional — free-form planning works identically to plan-doc-driven planning, just
with no `**Spec:**` value pointing at a plan-doc.

Side benefit: collapses three earlier design candidates (`**Plan:**`, `**External Ref:**`, planning-shaped pointer
header on plan-docs) into one polymorphic `**Spec:**` field reused across planning / quick / standard / external WUs.

### arc-commit skill stays user-invocable

The arc-commit skill remains a first-class user-invocable surface in both manual and auto modes. Under auto-commit,
the skill is the ad-hoc commit path for non-task work mid-session and for recovery after auto-commit fallback to
manual. Auto-commit's internal logic mirrors the skill's simple-path branch; complexity bumps to manual-with-prompt
rather than silent invocation of `prepare-commits`.

## Unknowns and Assumptions

**Open design decisions (PRD-time resolution):**

- "Approved" grammar finalization — the shape is settled per § Design Decisions; remaining is the final token
  catalog and the exact disambiguation regex/heuristic.
- Handoff-interior toggle enumeration — exact list of configurable handoff actions (status rotation, worktree push,
  notes push, quality-gate finalization, others TBD).
- Whether constitutional reframing warrants a new DEV-RULES.ARC section or fits within existing § Commit Discipline
  and § Session Management amendments.
- Final config keys: `push.timing` shape (likely `manual | on-handoff` or boolean toggle per § Design Decisions),
  `archive.cadence` shape (`with-integration | deferred | manual` per § Scope). PRD finalizes naming and enums.
- Exact field/value names for the State + Integration field model — § Scope establishes the conceptual shape; PRD
  finalizes field labels and enum values.
- **Gate terminology collision.** This plan introduces "gate" vocabulary (task-gate, commit-gate, push-gate,
  integration-gate) for the autonomy stack. ARC already uses "quality gates" for the tiered T1/T2/T3 check system
  ([strategy-quality-gates][strategy-qg], [DEV-RULES.PROJECT][dev-rules-project] § Quality Gates). The two
  meanings overlap lexically but are disjoint conceptually (autonomy gates = approval boundaries; quality gates =
  validation checks). Resolution options: (a) accept dual meaning with disambiguating qualifier in prose
  ("autonomy-gate" / "quality-gate") wherever ambiguity could arise; (b) rename one of the two — autonomy "gates"
  to "checkpoints" or "boundaries", or quality "gates" to "checks" or "tiers". PRD evaluates before settling
  vocabulary across DEV-RULES.ARC, strategy docs, and workflow text.

**Migration and validation details (PRD-time resolution):**

- Migration defaults for existing in-flight status files: `State: In Progress` for files with populated Task List;
  `**Spec:**` populated to `prd-{name}.md` if a co-located PRD exists, otherwise omitted; migration is "as-needed
  at next status-file touch" (typically next handoff), not mass sweep. Validate at PRD time that this default set
  doesn't break any in-flight WU shapes during the migration window.
- Failure-mode taxonomy under auto-commit / auto-push (PRD-detail). Modes to enumerate at PRD: pre-commit hook
  failure, T1/T2 quality-gate failure post-fire, network failure mid-push, partial multi-commit-cascade failure
  (some commits land, push fails). Connects to reversibility scope (Phase 4) — failure recovery uses the rollback
  protocol for the affected cascade.
- `**Spec:**` field minimal pre-commit validation under this WU: value is one of `.md` filename, URL, or empty.
  Tier-aware validation (e.g., standard tier requires `.md`, atomic tier forbids non-empty) is
  [plan-agile-wu-lifecycle][plan-awl] scope. The minimal check prevents drift between upstream introduction and
  downstream tier semantics.

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
   constitutional reframing language, parallel-session concurrency model framing, planning-session active
   surface (`activate-planning-branch` creates status file; `integrate-planning-branch` handles disposition;
   `template-status.md` adds `**Spec:**` field and `Planning` state value; probe sessionType inference reads
   `State: Planning`), minimal-but-necessary cascade to strategy docs to prevent contradiction.
2. **Status-file timing rule** — Handoff-and-ceremony-only update rule, workflow updates (process-task-loop,
   lifecycle workflows, session-handoff), strategy doc prose updates.
3. **Configuration surface + approval-signal vocabulary** — Axis naming and schema, signal classes per gate,
   "approved" grammar with strict disambiguation, session-init load-set autonomy-config-aware adaptation, default
   values matching current behavior.
4. **Reversibility / rollback protocol** — Mechanism design and implementation, session-local scope (prerequisite
   for Phase 5).
5. **Auto-commit mode** — Skill/workflow implementation, `prepare-commits` simple-path-only integration with
   complexity-bumps-to-manual fallback, deferred-review × auto-commit safe-accumulate resolution, arc-commit skill
   preservation as user-invocable surface, tests.
6. **Auto-push mode + handoff-interior toggles** — Auto-push-at-handoff configurability (push fires inside the
   handoff ceremony when configured); mid-session push remains explicit-ask only. Handoff ceremony
   configurability, workflow integration points, defaults.
7. **Strategy cascade + metadata-state foundation + integration specs** — Comprehensive cascade update;
   metadata-state foundation (State + Integration field model + sweep cadence config) for downstream lifecycle
   plans to consume; integration specs for upstream plans; verification.

Phase 4 gates Phases 5-6 (reversibility must land before auto-cascade modes ship). Phases 1-3 are relatively
independent and could overlap if scoped carefully.

### Dependencies

- **[ADR-016][adr-016] in Accepted state** — framing must be settled before execution.
- **Session-Init Optimization WU completion** — shipped (PR #21 merged); overlapping surface area
  (session-init, session-handoff, DEV-RULES.ARC edits) is cleared. No longer a blocker for Phase 1.
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
- **Validation gate between WU-A and WU-B (if split).** WU-A (Phases 1-3) lands on base and is dogfooded through
  self-host's own session-operational flow for a defined validation window — multiple sessions exercising the new
  status-file timing rule, the planning-session active surface, and the configuration surface — before WU-B
  begins. If the WU stays unified, the equivalent dogfooding gate sits between Phase 3 and Phase 4.

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
[dev-rules-project]: ../../reference/constitution/DEV-RULES.PROJECT.md
[strategy-team]: ../../reference/strategies/arc/strategy-team-coordination.md
[strategy-session]: ../../reference/strategies/arc/strategy-session-operations.md
[strategy-qg]: ../../reference/strategies/arc/strategy-quality-gates.md
[plan-sync]: plan-user-sync-ux.md
[plan-hooks]: plan-quality-gate-hooks.md
[plan-wf]: plan-worktree-foundation.md
[plan-awl]: plan-agile-wu-lifecycle.md
[plan-cwc]: ../feature/plan-concurrent-work-conventions.md
