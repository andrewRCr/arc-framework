# Notes: Session-Operational Flow

**Purpose:** Reference material and scratch space for the SOF work unit. Captures phase-specific design
rationale extracted from `prd-session-operational-flow.md` § Technical Considerations and task-generation
discussions, plus working observations as implementation surfaces.

**Intended lifespan:** Until SOF is archived.

---

## Phase 1 Rationale — Metadata-State Foundation + Cadence Refinements

**Phase ordering flip.** PRD listed metadata-state as Phase 3; task generation flipped it to Phase 1.
Reasoning: metadata-state has no dependency on configurable interlock release, and SOF's own integration
window benefits from the cadence refinements (Step 6c pre-advance, post-PR eddy guidance, PR URL archival
timing) landing first. Self-host's own SOF integration uses the new cadence; commit/push interlock release
settings activate post-SOF as the dogfooding next step.

**Bundling stays.** PRD's open question about splitting the metadata-state foundation into a separate WU
(`metadata-state-foundation`) resolved at task generation: surface is medium (template + validator + workflow
text edits), not large enough to justify split overhead.

**`archive.cadence` enum: drop `deferred` for v1.** PRD § Technical Considerations covers this fully —
`deferred` without an explicit automatic trigger collapses semantically into `manual` (both wait for user
invocation). v1 ships `with-integration | manual` as two genuinely distinct behaviors. P1.a ships later if
dogfooding reveals a clear automatic-trigger semantic; the trigger should bake into the value name
(`at-planning-activation`, `prompt-on-threshold`) rather than re-creating the original ambiguity with a
generic `deferred`.

**Migration: direct active-file update with no helper.** PRD § Technical Considerations covers this fully.
Documentation lives in `strategy-session-operations.md` (loaded on-demand, not session-init). No DEV-RULES.*
additions — keeps token load off session-loaded surfaces. Self-host's small in-flight status-file count makes
direct update preferable to weakening CHECK 16 coverage for legacy absence.

**Sweep-eligibility check location.** `archive-work-unit.md` workflow gains a precondition prose check
(Phase 1.5.a). Could be elevated to CLI code if dogfooding shows the check needs structural enforcement; v1
keeps it in workflow text and lets the agent verify against the `**State:**` + `**Integration:**` field
values it reads.

**`**Integration:**` field labels: GitHub-style vocabulary.** Plan originally proposed
`PR review | Review fixes | Ready to merge | Merged` (author-perspective framing). Discovery settled on
`Awaiting PR | Awaiting review | Changes requested | Ready to merge | Merged` — GitHub PR vocabulary, more
familiar to adopters, platform-portable. `Awaiting PR` covers the committed post-cleanup window before PR
creation. The `Changes requested ↔ Awaiting review` bidirectional transition handles push-fixes → re-review
cycles. WUs in draft-PR state stay at `Awaiting PR`; no `Draft` value (would muddy
queue semantics).

**No probe extension needed.** PRD § Technical Considerations: the metadata-state foundation extends
`template-status.md` fields, but the existing session-init probe contract handles them via the `## Active
Work` partial-read. The composite probe surfaces resolved active-status-file paths; orientation reads State
and Integration field values directly from the file. No new top-level probe field; no probe schema changes.
This matches the existing pattern for optional status-file fields (Interrupts / Paused At / Superseded By).

---

## Phase 2 Rationale — Commit-Interlock Release

**Config shape shifted from ladder to independent interlocks.** Planning originally carried a single
`session.autonomy: manual-commit | auto-commit | auto-push` ladder. ADR-016's vocabulary is sharper than that:
the configurable mechanisms are commit-interlock and push-interlock, while task-interlock remains invariant.
SOF now uses `session.commit_interlock: manual | on-task-approval` and
`session.push_interlock: manual | on-handoff` so adopters can choose handoff push without also choosing commit
release on task approval.

**arc-commit extraction approach: shared-by-reference, not literal-extraction or shared-helper.** Open
Question resolved at task generation. Post-IF skill thinning (commit `38fe6f2` and earlier) collapsed
`arc-commit/SKILL.md` to ~54 lines of dispatch markdown. There's no "simple-path code" to extract — the
skill IS the agent following a markdown procedure. Commit-on-task-approval's fire path documents the trigger condition
(in process-task-loop, terse) and points at arc-commit § Step 2-6 as the procedure to execute. Complexity
criteria reference arc-commit § Step 2 directly. Single source of truth; the skill remains user-invocable as
the ad-hoc commit path; commit-on-task-approval is a separate fire trigger executing the same documented procedure.

**Token economy: process-task-loop gets minimum trigger condition.** Process-task-loop loads every session.
Commit-on-task-approval trigger gets one short paragraph: trigger conditions + procedure pointer +
complexity-bump note. Full semantics — approval-signal grammar, complexity criteria details, deferred-review ×
commit-interlock release
interaction, contributor-role behavior, why-not-silent-prepare-commits rationale — live in
`strategy-session-operations.md` (loaded on-demand). Same discipline applies to session-init load-set
adaptation (Phase 2.4) and contributor-role boundary (Phase 2.5): terse trigger inline, depth in strategy
doc.

**Deferred-review default = safe-accumulate.** PRD § Technical Considerations covers this fully. Per-task
releasing the commit-interlock inside a deferred range would violate the spirit of the interlock model — user
is unavailable for per-task approval; firing per task would commit work without review. Safe-accumulate keeps work staged
for unit-review on return. Per-task fire requires explicit opt-in at deferral time (e.g., "work through
5.2-5.4 with commit on each task approval while I'm away"). Opt-in rather than default.

**Complexity bumps to manual-with-prompt, never silent prepare-commits.** Silent invocation of
prepare-commits would surprise the user with cascade behavior they didn't sanction. Bumping to
manual-with-prompt surfaces the triggering condition and lets the user decide whether to invoke
prepare-commits explicitly. Trigger conditions: multi-concern staged set, interleaved files spanning
unrelated tasks, accumulated multi-session work — all from arc-commit § Step 2.

---

## Phase 3 Rationale — Push-Interlock Release

**Push release is independent.** `session.push_interlock: on-handoff` releases the push-interlock during
handoff only. It does not imply `session.commit_interlock: on-task-approval`; all four setting combinations are
valid. Phase 3.2 verifies this independence explicitly.

**Push-ordering invariant from IF.** Worktree-push lands before notes-push at handoff when both fire.
Enforced by session-handoff per-action-checklist ordering (already shipped from IF; Phase 3.1.b verifies or
strengthens the ordering note).

**Mid-session push remains explicit-ask in all modes.** `session.push_interlock: on-handoff` does not change
non-handoff push semantics. Mid-session push is the user's call regardless of interlock settings.

---

## Phase 4 Rationale — Failure-Mode Handling + Strategy Cascade

**Failure-mode #5 detection signal: existing pointers, no new infra.** Open Question resolved at task
generation. The composite of (a) `**Next Action:**` workflow-step pointer (from session-handoff §
_Workflow step pointer_; convention: `<workflow-name> Step <N> — <description>`), (b) `git status --porcelain`,
and (c) `git diff --cached --stat` provides enough signal for agent-crash mid-cascade detection. No new
checkpointing infrastructure; no probe extensions needed. Recovery routine documented in process-task-loop
(terse pointer) and strategy-session-operations (full per-mode procedures).

**P1.b deferred: pre-advance criteria stay inline in `integrate-work-unit.md`.** Open Question resolved at
task generation. No downstream plan currently references the pre-advance pattern by name or by Step 6c
(searched plan-completion-status-consolidation, plan-agile-wu-lifecycle, plan-arc-modes, plan-quality-gate-hooks,
plan-user-sync-ux, plan-worktree-foundation, plan-concurrent-work-conventions). Three criteria stay inline
in `integrate-work-unit.md` Step 6c per PRD baseline. If a future plan surfaces a similar opportunity (one
that meets all three criteria — mechanical, idempotent/absence-detectable, low redo cost), lift the criteria
to `strategy-session-operations.md` at that time.

**Failure-mode taxonomy split: bad-state vs transit vs process.** PRD § Technical Considerations covers this
fully. Three recovery categories with materially different paths. Bad-state failures (pre-commit hook fail,
post-commit QG fail) need rollback or fall-to-manual — local state is wrong. Transit failures (network fail
mid-push, partial multi-commit cascade) need retry — the cascade was correct, infra hiccupped, no rollback
applies. Process failures (agent crash mid-cascade) need user decision — resume vs rollback depends on what
the user wants for the partial work. Rollback dev-rule from IF applies to bad-state failures only.

---

## Phase 5 Rationale — Verification

**Validation-window vehicle: plan-user-sync-ux confirmed.** Open Question resolved at task generation.
plan-user-sync-ux is the leading downstream-consumer plan (small, in-scope for parallel, consumes IF's
handoff-interior toggle pattern + push-ordering invariant). 1-2 self-host sessions exercising
`session.commit_interlock: on-task-approval` and `session.push_interlock: on-handoff` between SOF integration
and plan-user-sync-ux activation. Observation log appended to this file's § Observations section as discoveries
surface.

**Validation window scope: behavioral, not constitutional.** SOF's deliverables are largely verifiable by
integration tests; the validation window covers experience-level questions: does commit release on task
approval feel right? Do deferred-review cascades surface correctly? Do failure-mode recoveries match the
documented paths? Do cadence refinements actually eliminate the metadata-commit churn they're supposed to
eliminate? UX-focused observations, not structural revisits. If structural issues surface, route per PRD §
Technical Considerations § Validation window for this WU (per-decision routing analogous to IF's).

---

## Test-Surface Note (Phases 2-4)

PRD reqs #25-27 call for vitest unit/integration tests covering commit-on-task-approval fire path, complexity-detection
bump-to-manual, deferred-review safe-accumulate, and failure-mode fallback. Most of these are agent-procedure
behaviors that don't unit-test cleanly via vitest — the agent's runtime behavior under each interlock setting is
the test surface. Concrete vitest coverage falls on:

- CHECK 16 enum-validation logic (Phase 1.2 — direct unit tests)
- `archive.cadence` config schema validation (Phase 1.3 — direct unit tests)
- Crash-recovery detection logic, IF and AS far as it touches CLI-callable helpers
- Probe value resolution for `session.commit_interlock`, `session.push_interlock`, and `archive.cadence`

Agent-procedure behaviors (commit-on-task-approval fire trigger, complexity bump-to-manual, deferred-review
safe-accumulate, mid-session push semantics) are verified during the validation window via real-use cycles
rather than vitest scaffolding. If a test pattern emerges for procedure verification (e.g., session
simulation infra), reconsider; not pre-built for v1.

---

## Open Questions Resolved at Task Generation

- **Phase 3 split contingency** → bundled (medium surface; split overhead not justified).
- **arc-commit simple-path extraction approach** → shared-by-reference (no code to extract post-IF skill
  thinning).
- **Failure-mode #5 detection signal shape** → existing `**Next Action:**` workflow-step pointer + git state
  composite; no new infrastructure.
- **P1.b — pre-advance criteria in strategy-session-operations** → deferred (no downstream plan references
  the pattern; criteria stay inline in `integrate-work-unit.md`).
- **Validation-window vehicle** → plan-user-sync-ux confirmed.
- **`archive.cadence: deferred` value** → dropped for v1 per PRD; ships as P1.a if dogfooding triggers.

---

## Observations

<!-- Added during execution as discoveries surface. Use freely — durable capture surface for "I noticed X
while working on task Y" content that doesn't belong in task completion notes or session notes. -->
