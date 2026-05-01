# PRD: Session-Operational Flow

**Purpose:** Implement configurable commit- and push-interlock release behavior and the metadata-state foundation
(State enum extension, Integration field, sweep cadence, integration-window cadence refinements) against the
constitutional frame Interlock Foundation established — turning the configurable interlock-release surface from
scaffolding into a live operational surface and unblocking downstream lifecycle consumers.

---

## Introduction

[Interlock Foundation][prd-foundation] (WU-A) shipped the constitutional frame for ARC's session-operational
concerns: vocabulary (task / commit / push / integration interlocks), the planning-session active surface, the
structured task-completion prompt as base behavior, the composite handoff probe, the handoff-interior toggle
pattern, and the rollback dev-rule. The frame is stable; the validation window between WU-A integration and
this WU's activation confirmed adopters can build against it without structural revisits.

What's missing: behavior. The commit- and push-interlock vocabulary exists, but the configurable release
behavior is not yet wired. The status-file template carries `**State:** Planning` but no other lifecycle
states are defined, so workflows that need to track WU progression past planning have no schema to pin against.
Cadence refinements observed during IF integration (Step 6c pre-advance, post-PR-creation eddy guidance,
PR URL archival timing) were captured for this WU but not yet implemented.

This work unit lands the **configurable interlock-release behaviors** and the **metadata-state foundation** —
turning the frame's surface area into operational reality. The commit-interlock can release on task approval
when configured; the push-interlock can release on handoff when configured; the `**State:**` enum extends to
cover the WU lifecycle past planning; a new optional `**Integration:**` field tracks the integration window; a
sweep-cadence config key governs when archival fires; and the cadence refinements eliminate per-cycle
metadata-commit churn.

**Why now:** five downstream plans ([plan-user-sync-ux][plan-sync], [plan-quality-gate-hooks][plan-hooks],
[plan-worktree-foundation][plan-wf], [plan-concurrent-work-conventions][plan-cwc],
[plan-agile-wu-lifecycle][plan-awl]) consume either the configurable interlock-release behaviors, the
metadata-state foundation, or both. plan-agile-wu-lifecycle in particular hard-depends on the State +
Integration field model for its tier-aware integration/sweep workflow rewrites. Self-host's own
session-operational flow continues to operate with both interlocks manual through the SOF planning + execution
windows — the configured interlock release settings activate post-SOF as the natural next dogfooding step,
validating the behaviors against real-use cycles.

## Goals

1. Implement `session.commit_interlock: on-task-approval` behavior — task approval releases the
   commit-interlock, mirrors the arc-commit skill's simple-path branch, falls back to manual-with-prompt on
   complexity, and preserves atomicity.
2. Implement `session.push_interlock: on-handoff` behavior — handoff releases the push-interlock when
   configured; mid-session push remains explicit-ask only; push-ordering invariant from IF enforced.
3. Land the metadata-state foundation — `**State:**` enum extended to cover the WU lifecycle
   (`Planning | In Progress | Complete | Paused | Superseded`); new optional `**Integration:**` field
   tracks integration-window position with bidirectional state transitions allowed; sweep cadence
   configurable via `archive.cadence`; CHECK 16 extended to validate both fields.
4. Operationalize integration-window cadence refinements — Step 6c pre-advance eliminating one
   metadata-commit per integration cycle; post-PR-creation eddy guidance discouraging awkward-window
   handoffs; PR URL archival timing avoiding post-PR metadata commits.
5. Define failure-mode taxonomy and per-mode recovery paths — five failure modes (pre-commit hook,
   T1/T2 QG post-commit, network mid-push, partial multi-commit cascade, agent crash mid-cascade)
   across three categories (bad-state, transit, process) with documented recovery semantics.
6. Cascade strategy doc updates — interlock-release-aware coordination guidance, interlock-config-aware
   load-set documentation, deferred-review × commit-on-task-approval interaction documentation.
7. Unblock downstream consumer plans — particularly plan-agile-wu-lifecycle's hard dependency on the
   metadata-state foundation.

## Use Cases or System Scenarios

**Scenario 1: Commit-interlock releases on task approval.**
Today (`session.commit_interlock: manual`, default): agent reports task completion; structured prompt fires
(`Commit and proceed to Task X.Y?`); user types `y`; agent commits and advances. Two events from the
user perspective.
After (`session.commit_interlock: on-task-approval`): agent reports task completion; structured prompt fires;
user types `y`; the same approval releases the commit-interlock and the agent advances. Same prompt rhythm,
bounded release on approval. The arc-commit skill's simple-path logic runs internally; complexity bumps
(multi-concern, interleaved files, multi-session accumulated work) trigger manual-with-prompt fallback rather
than silent invocation of prepare-commits.

**Scenario 2: Deferred-review × commit-interlock safe-accumulate.**
User defers review for tasks 5.2-5.4 ("work through these while I'm away"). Under
`session.commit_interlock: on-task-approval`, tasks accumulate as staged work; the commit-interlock does NOT
release per task within the deferred range. On user return, accumulated work surfaces for review and approval
as a unit. Per-task release inside a deferred range is available only via explicit instruction at deferral time
("work through 5.2-5.4 with commit on each task approval while I'm away").

**Scenario 3: Push-interlock releases on handoff.**
Today (`session.push_interlock: manual`, default): handoff ceremony commits status update; user manually
invokes push. After (`session.push_interlock: on-handoff`): handoff ceremony commits status update and fires
push as part of the ceremony. Mid-session push remains explicit-ask only — this setting does not change
non-handoff push semantics and does not require `session.commit_interlock: on-task-approval`. When both
worktree-push and notes-push fire at handoff, worktree-push lands first per the IF push-ordering invariant.

**Scenario 4: Status file evolves through WU lifecycle.**
A WU activates with `**State:** In Progress`, `**Integration:**` (empty); status file tracks active
execution. On task completion + integration prep, State transitions to `Complete`; on PR creation,
Integration becomes `Awaiting review`. If reviewer requests changes, Integration flips to
`Changes requested`; after fixes pushed, back to `Awaiting review`. On approval-and-merge-ready,
`Ready to merge`; on merge, `Merged`. Sweep eligibility: `State: Complete + Integration: Merged`. After
sweep, status file is removed from `active/` — location reflects state without an `Archived` value.

**Scenario 5: Integration cadence refinement eliminates metadata churn.**
Today: `integrate-work-unit.md` Step 6c sets the status pointer to "Run Step 7"; agent runs Step 7
(mechanical: `git push && gh pr create`); pointer must update to "Run Step 8"; that's a metadata-only
commit between two real operations.
After: Step 6c pre-advances the pointer to Step 8 directly; Step 7 fires; no intervening metadata commit.
Recovery on agent crash between Step 6c and Step 7: post-resume agent verifies "is the PR created?" via
`gh pr list`; if no, runs Step 7 first; if yes, proceeds to Step 8. The pre-advance is safe because Step 7
is mechanical, idempotent (`gh pr create` errors on existing PR), and detectable.

**Scenario 6: PR URL lands during archival.**
Today: PR creation produces a URL; recording it into the completion-doc and committing happens as a
separate step; if handoff fires the same session, the handoff commit creates a second metadata commit.
After: the completion doc carries `{pending until archival}` during review, and archive-work-unit fills the
merged PR URL before moving the completion doc into the archive. No post-PR metadata commit or runtime
detection of "just-created-PR" state is needed.

**Scenario 7: Failure-mode recovery — partial cascade under push-on-handoff.**
With `session.push_interlock: on-handoff`, the first commit pushes successfully; network fails before the
second commit reaches origin. Local state is good (both commits exist); only push failed. Recovery: handoff
summary surfaces the partial-push state; commits stay local; user retries push (or next handoff retries under
the same push-interlock setting). No rollback — the cascade was correct, infra hiccupped.

## Requirements

### P0 — Required for completion

**Commit-interlock release (Phase 2):**

1. `arc-config.yml` replaces the inert `session.autonomy` enum with
   `session.commit_interlock: manual | on-task-approval` and
   `session.push_interlock: manual | on-handoff`. Defaults are `manual` for both settings.
2. Commit-interlock release fires when `session.commit_interlock: on-task-approval` AND a task-interlock
   approval signal is received per the IF structured-prompt format. Approval signals: any short affirmative as
   the first word of the response (`y` / `yes` / `yeah`); redirect syntax preserved (`y, also <X>` /
   `y; <redirect>`).
3. Commit-on-task-approval's internal logic mirrors the arc-commit skill's simple-path branch. The skill remains
   user-invocable under all interlock settings — provides ad-hoc commit capability for non-task work mid-session
   and recovery after commit-on-task-approval fallback.
4. Complexity bumps to manual-with-prompt rather than silent invocation of prepare-commits. Trigger
   conditions: multi-concern staged set, interleaved files spanning unrelated tasks, accumulated
   multi-session work. The agent stops, surfaces the triggering condition, and prompts the user before
   invoking prepare-commits.
5. Deferred-review × commit-on-task-approval defaults to safe-accumulate. Within a deferred range, the
   commit-interlock does NOT release per task; tasks accumulate as staged work for user review on return. Per-task
   commit-on-task-approval
   inside a deferred range is available only via explicit instruction at deferral time.
6. Session-init load-set adapts to commit-interlock config. When `session.commit_interlock` resolves to
   `on-task-approval`, eagerly load the commit-format and commit-context-format methods at session-init. These
   methods today load via the arc-commit skill; commit-on-task-approval fires between tasks
   without invoking the skill, so session-init becomes the load trigger.
7. Contributor-role commit-on-task-approval stages code only — no project-level status-file updates, matching the
   role-separation rule per [DEV-RULES.ARC][dev-rules-arc] § Commit Discipline. Contributor status files
   are gitignored and updated at handoff regardless of mode.

**Push-interlock release (Phase 3):**

8. `session.push_interlock: on-handoff` releases the push-interlock inside the handoff ceremony. Mid-session
   push remains explicit-ask only; push-on-handoff does not change non-handoff push semantics and does not
   imply `session.commit_interlock: on-task-approval`.
9. Push-ordering invariant from IF holds: when both worktree-push and notes-push fire at handoff,
   worktree-push lands before notes-push. Enforced by handoff-workflow per-action checklist ordering.
10. session-handoff workflow consumes `session.push_interlock` from the composite handoff probe. When the
    resolved value is `on-handoff`, the workflow fires push as part of the ceremony's per-action checklist;
    otherwise push remains explicit-ask.

**Metadata-state foundation (Phase 3):**

11. `template-status.md` `**State:**` enum extended to `Planning | In Progress | Complete | Paused | Superseded`.
    `Planning` shipped with IF; this WU adds `In Progress` (already in use today as an unenumerated default),
    `Complete` (terminal pre-sweep state for implementation work), `Paused` (work temporarily halted),
    `Superseded` (work abandoned and replaced by another WU).
12. `template-status.md` adds optional `**Integration:**` field — transient workflow position during the
    integration window. Enum: `Awaiting PR | Awaiting review | Changes requested | Ready to merge | Merged`.
    Bidirectional `Changes requested ↔ Awaiting review` transitions allowed (push fixes after
    change-request → back to awaiting re-review).
13. `**Integration:**` is absent before integration prep. When `**State:**` becomes `Complete`,
    `**Integration:**` is required and initialized to `Awaiting PR` until the PR exists. Cleared at sweep
    when the status file is removed.
14. Sweep eligibility: `State: Complete + Integration: Merged`. After sweep, status file is removed from
    `active/` — location reflects state without an `Archived` enum value.
15. `arc-config.yml` adds `archive.cadence: with-integration | manual`. Default `with-integration`
    (sweep-as-you-go: archive ops in integration PR as separate commit per multi-commit-PR norms).
    `manual` covers the "batch archival opportunistically" use case via user invocation. A `deferred`
    value with an explicit automatic trigger (e.g., "at next planning-branch activation") may land later
    if a clear adopter need surfaces; not in v1 (avoiding enum bloat without a defined trigger).
16. Pre-commit CHECK 16 (`validate-status-spec.ts`) extended to require a valid `**State:**` value, require
    valid non-empty `**Integration:**` only when `State: Complete`, and reject `**Integration:**` on other
    states.
17. Migration: existing status files are updated in-place as part of this WU instead of allowing legacy
    absence. No CLI helper command (no `arc migrate-status-states`) — YAGNI for v1.
18. Session-init orientation surfaces `**Integration:**` when present. Slots into the existing
    `## Active Work` partial-read pattern of "optional fields when present" (alongside Interrupts /
    Paused At / Superseded By). No probe extension needed — orientation reads the field directly from
    the partial read.

**Integration-window cadence refinements (Phase 3):**

19. `integrate-work-unit.md` Step 6c pre-advances the status pointer to Step 8, eliminating the metadata
    commit between Step 6c and Step 8. Limited to this case for v1. Three criteria documented in the
    workflow as the rationale for the pre-advance:

    - **Mechanical** — Step 7 has no judgment, no decision
    - **Idempotent or absence-detectable** — `gh pr create` errors on existing PR; `gh pr list` confirms
      whether Step 7 actually fired post-crash
    - **Low redo cost** — re-running Step 7 if the absence detection produces a false negative is cheap

    Generalization beyond Step 6c → 7 reconsidered when concrete cases meeting all three criteria
    surface; not pre-applied to other workflows.
20. `integrate-work-unit.md` Phase 2 adds post-PR-creation eddy guidance: recommend either (a) handoff at
    Step 6c boundary before PR creation, or (b) continuing into review work after. Discourages handoff
    in the awkward window between `gh pr create` and reviewer's first pass — both would re-trigger CR
    review on subsequent metadata commits.
21. PR URL archival rule: completion docs carry `{pending until archival}` through PR review.
    `archive-work-unit.md` resolves the merged PR URL before deleting the child branch and records it in
    `completion-{name}.md` as part of the archival commit. This preserves the durable archive link without a
    post-PR metadata-only commit or runtime detection of "just-created-PR" state during handoff.

**Failure-mode handling (cross-phase):**

22. Failure-mode taxonomy enumerated in [strategy-session-operations][strategy-session] with per-mode
    recovery paths:

    | # | Failure mode | Category | Detection | Recovery |
    | --- | --- | --- | --- | --- |
    | 1 | Pre-commit hook failure (commit-on-task-approval fire) | Bad-state (pre) | Hook exit code | Fall back to manual-with-prompt; surface failure; user fixes underlying issue |
    | 2 | T1/T2 QG failure post-commit | Bad-state (post) | Post-commit gate fires | Apply rollback dev-rule (session-local `git reset`); return to manual for affected work |
    | 3 | Network failure mid-push (push-on-handoff) | Transit | Push exit code | Surface in handoff summary; commits stay local; user retries push |
    | 4 | Partial multi-commit cascade (commits land, push fails) | Transit | Push exit code on multi-commit handoff | Same as #3 — local state is good, retry push |
    | 5 | Agent crash mid-cascade | Process | Session-resume scan: workflow-state pointer + uncommitted staged content | Prompt user: continue from interruption point or rollback cascade-to-date |

    Bad-state failures need recovery action (rollback, fall-to-manual). Transit failures need retry (the
    cascade was correct, infra hiccupped). Process failures need decision (resume vs rollback is the
    user's call). Rollback dev-rule from IF applies to bad-state failures only.

**Strategy doc cascade (cross-phase):**

23. [strategy-team-coordination][strategy-team] gains interlock-release-aware coordination guidance: how
    task ownership, handoff conventions, and concurrent-pair coordination interact with commit-on-task-approval vs
    manual commit. Concurrent pairs under commit-on-task-approval have different commit-rate dynamics than under
    manual commit; the strategy documents the distinction.
24. [strategy-session-operations][strategy-session] gains interlock-config-aware load-set documentation
    (which methods load eagerly under which interlock settings), deferred-review × commit-on-task-approval interaction
    documentation, and the failure-mode taxonomy from req #22.

**Tests:**

25. Skill/workflow changes verified via vitest unit tests covering the commit-on-task-approval fire path,
    complexity-detection bump-to-manual, deferred-review safe-accumulate, and failure-mode fallback.
26. Commit-on-task-approval mode integration tests cover structured-prompt parsing under each interlock setting,
    deferred-review interaction (safe-accumulate + per-task explicit override), and each failure-mode
    recovery path (mocked failures for the four detectable modes; agent-crash recovery tested via
    session-resume integration test).
27. Metadata-state additions verified via structural CHECKs on template-status (CHECK 16 extension)
    and unit tests on the enum-validation logic.

### P1 — Should-have, defer if scope tight

- **a. `archive.cadence: deferred` value** with an explicit automatic trigger (e.g., "at next
  planning-branch activation" or "session-init prompts when pending sweeps exceed N"). Lands if
  dogfooding during this WU's interlock-cascade exercise reveals a clear automatic-trigger need; otherwise
  ships in a future WU when concrete adopter demand surfaces.
- **b. Generalization criteria for pre-advance pattern** documented in strategy-session-operations as
  "applies in this case; reconsider when concrete cases meeting the three criteria surface." Provides
  forward guidance for downstream consumer plans without committing to a sweep across other workflows.

### P2 — Nice-to-have

- **a. Concurrent-pair commit-rate guidance** in strategy-team-coordination beyond the basic
  interlock-release awareness from req #23. Empirical observation during dogfooding may reveal patterns
  worth codifying.

## Non-Goals

The following are explicitly out of scope for this WU. They live in upstream/sibling/downstream plans:

- **Constitutional foundation, status-file timing rule, planning-session active surface, configuration
  surface (incl. composite handoff probe and handoff-interior toggle pattern), structured task-completion
  prompt as base behavior, rollback dev-rule** — all in [Interlock Foundation][prd-foundation] (upstream
  WU-A).
- **Worktree push + notes push pairing implementation.** [plan-user-sync-ux][plan-sync] consumes the
  handoff-interior toggle pattern + push-ordering invariant to solve the `user.sync_push: always`
  incoherence.
- **Quality-gate hook placement at interlock-stack junctions.** [plan-quality-gate-hooks][plan-hooks]
  attaches validation gates to the commit / push / integration junctions IF formalized.
- **Multi-worktree mechanics and spawn-vs-continue semantics.** [plan-worktree-foundation][plan-wf]
  consumes the parallel-session framing here and the metadata-state foundation from this WU.
- **Concurrent-work conventions consuming configurable interlock release.**
  [plan-concurrent-work-conventions][plan-cwc].
- **Integration-workflow rewrites and tier-aware sweep ceremony.** [plan-agile-wu-lifecycle][plan-awl]
  implements the metadata-state foundation against tier-aware lifecycle workflows. This WU lands the
  schema; that plan owns the workflow rewrites against it.
- **Branch-gone resolution under configured interlock release settings.** Non-applicable. Branch/worktree removal
  stays manual under all interlock settings per [ADR-016][adr-016].
- **Promotion of rollback dev-rule to a `/arc-rollback` skill.** Candidate future WU if dogfooding during
  this WU's interlock-cascade exercise shows demand. Not in scope here.
- **Mass-migration helper CLI command** (`arc migrate-status-states` or similar). Lazy migration is
  gentle enough; building a helper is YAGNI for v1.
- **`Draft` value in `**Integration:**` enum.** WUs in draft-PR state leave `**Integration:**` empty and
  the workflow handles it. Adding `Draft` as an enum value muddies queue semantics for marginal coverage.
- **Generalization of the pre-advance pattern across other workflows.** Limited to integrate-work-unit
  Step 6c → 7 in v1. Three criteria documented as the rationale; pattern reconsidered when concrete
  cases surface (see Open Questions).

## Technical Considerations

**Config shape: independent interlock release settings.** ADR-016's core model holds: task- and
integration-interlocks are invariant; commit- and push-interlocks are configurable. During SOF planning, the
single `session.autonomy: manual-commit | auto-commit | auto-push` ladder was replaced with two independent
flat settings: `session.commit_interlock: manual | on-task-approval` and
`session.push_interlock: manual | on-handoff`. This avoids implying `push-on-handoff` requires
`commit-on-task-approval`, avoids "auto" terminology that suggests agent-chosen timing, and preserves the
interlock vocabulary without inventing a handoff-interlock.

**arc-commit skill preservation as design constraint.** The skill remains a first-class user-invocable surface
under all interlock settings — when `session.commit_interlock: on-task-approval`, the skill is still the
ad-hoc commit path for non-task work mid-session and the recovery path after commit-on-task-approval fallback.
Commit-on-task-approval's internal logic mirrors the skill's simple-path branch by literal-extraction or
shared-helper rather than reimplementation; the implementation choice (extract vs. share) settles at task-list
time based on the simple-path's actual shape after IF's late-stage skill thinning. Complexity bumps to
manual-with-prompt rather than silent invocation of prepare-commits — silent invocation would surprise the user
with cascade behavior they didn't sanction.

**Deferred-review × commit-on-task-approval semantics.** Safe-accumulate is the default. Reasoning: deferred
review exists because the user is away or unavailable for per-task approval; under those conditions, releasing
the commit-interlock per task would commit work without review, violating the spirit of the interlock model.
Tasks accumulate as staged work; user reviews and approves as a unit on return. Per-task commit release inside a
deferred range remains available, but only via explicit instruction at deferral time — opt-in rather than
default.

**Composite probe extension: none needed.** The metadata-state foundation extends `template-status.md`
fields, but the existing session-init probe contract handles them via the `## Active Work` partial-read.
The composite probe surfaces resolved active-status-file paths; orientation reads State and Integration
field values directly from the file. No new top-level probe field; no probe schema changes. This matches
the existing pattern for optional status-file fields (Interrupts / Paused At / Superseded By).

**`archive.cadence` enum decision: drop `deferred` for v1.** The plan originally proposed
`with-integration | deferred | manual`. Discovery surfaced that `deferred` without an explicit automatic
trigger collapses semantically into `manual` (both wait for user invocation). v1 ships
`with-integration | manual` as two genuinely distinct behaviors. A `deferred` value with a defined
automatic trigger ships later if concrete adopter demand emerges (P1.a) — the trigger semantic should
bake into the value name (`at-planning-activation`, `prompt-on-threshold`, etc.) rather than ship a
generic `deferred` that re-creates the original ambiguity.

**`**Integration:**` field labels: GitHub-style vocabulary.** Plan originally proposed
`PR review | Review fixes | Ready to merge | Merged` (author-perspective framing). Discovery settled on
`Awaiting PR | Awaiting review | Changes requested | Ready to merge | Merged` — GitHub PR vocabulary, more
familiar to adopters, platform-portable (GitLab MRs, Bitbucket PRs use similar concepts; vocabulary is
generic English). `Awaiting PR` covers the committed post-cleanup window before PR creation. The
`Changes requested → Awaiting review` bidirectional transition handles the push-fixes → re-review cycle.
WUs in draft-PR state stay at `Awaiting PR`; no `Draft` value (would muddy queue semantics).

**Pre-advance pattern criteria documented in workflow, not pre-applied.** The Step 6c → 7 pre-advance
ships in `integrate-work-unit.md` with the three criteria (mechanical + idempotent/detectable + low
redo cost) as inline rationale. Other workflows are NOT pre-swept for similar opportunities — designing
the pattern around one validated case risks over-fitting. If concrete cases meeting all three criteria
surface in downstream plans (`arc user save` post-handoff, file moves during sweep ceremony, etc.), the
pattern can be applied case-by-case at that time.

**PR URL archival timing.** The completion doc keeps `**Pull Request:** {pending until archival}` during
review because the PR URL is active context for authors and reviewers in the PR UI. `archive-work-unit.md`
fills the durable link after merge, before deleting the child branch, so future archive readers get the link
without a metadata-only post-PR commit that restarts CI.

**Migration approach: update active status files with no helper.** Status files in flight at SOF activation
must have a valid `**State:**`; `**Integration:**` is absent unless the file is already in `State: Complete`.
The self-host repo has a small number of in-flight status files, so this WU updates them directly instead of
weakening hook coverage. No mass-sweep migration helper command; no `arc migrate-status-states`. Adopters will
encounter the field through normal
work. If demand for a one-shot migration surfaces post-ship, the helper can land later.

**Failure-mode taxonomy split: bad-state vs transit vs process.** The five failure modes split into three
recovery categories with materially different paths. Bad-state failures (pre-commit hook fail, post-commit
QG fail) need rollback or fall-to-manual — the local state is wrong. Transit failures (network fail
mid-push, partial multi-commit cascade) need retry — the cascade was correct, infra hiccupped, no
rollback applies. Process failures (agent crash mid-cascade) need user decision — resume vs rollback
depends on what the user wants for the partial work. The taxonomy lives in
strategy-session-operations.md; per-mode recovery is mechanically referenceable rather than each
adopter rederiving.

**CHECK 16 extension scope.** The existing CHECK 16 (`validate-status-spec.ts` from IF) validates
`**Spec:**` field shape. Extension adds `**State:**` enum-membership validation plus `**Integration:**`
validation tied to `State: Complete`: required and non-empty for `Complete`, rejected otherwise. Workflow
ordering still owns the state transitions; the hook enforces the file shape.

**Bootstrap consideration: SOF's own session uses pre-existing flow.** This WU implements
`session.commit_interlock: on-task-approval` and `session.push_interlock: on-handoff`, but its own
implementation sessions run with both interlocks manual. That's intentional — the configured interlock release
settings activate post-SOF as the dogfooding next-step. SOF's own validation window (Open Questions) rides the
next post-SOF WU's execution sessions, not its own.

**Validation window for this WU.** Lighter than IF's three-session window. SOF's deliverables are
behavioral (modes, fields, refinements) and largely verifiable by integration tests; less validation-by-use
needed than IF's constitutional surface required. But the *experience* still needs validation: does
commit release on task approval feel right? Do deferred-review cascades surface correctly? Do failure-mode
recoveries match the documented paths? Do cadence refinements actually eliminate the
metadata-commit churn they're supposed to eliminate? 1–2 sessions, UX-focused, riding the next post-SOF
WU as the natural vehicle (likely [plan-user-sync-ux][plan-sync] per the plan's downstream-consumption
notes — small, in-scope for parallel with this WU's Phase 2). Observation log in
`notes-session-operational-flow.md`. Failure-Mode Handling routing analogous to IF's: per-decision
routing for behavior tweaks vs schema tweaks vs workflow prose.

## Success Criteria

- All quality gates pass at WU completion: markdown lint (zero violations), TypeScript typecheck
  (zero errors), test suite (all pass), build (succeeds).
- Commit-interlock release operates correctly:
    - Fires under task completion when `session.commit_interlock: on-task-approval` is configured
    - Mirrors arc-commit skill's simple-path branch
    - Complexity bumps to manual-with-prompt; never silent invocation of prepare-commits
    - Safe-accumulate operates correctly under deferred review (no per-task fire by default)
    - arc-commit skill remains user-invocable under all interlock settings
    - Contributor role under commit-on-task-approval stages code only — no project-level status-file updates
- Push-interlock release operates correctly:
    - Fires inside the handoff ceremony when `session.push_interlock: on-handoff` is configured
    - `session.push_interlock: on-handoff` does not require `session.commit_interlock: on-task-approval`
    - Mid-session push remains explicit-ask only
    - Push-ordering invariant holds when both worktree-push and notes-push fire at handoff
- Metadata-state foundation operates correctly:
    - `**State:**` enum extension covers WU lifecycle through one full cycle (Planning → In Progress →
      Complete → swept)
    - `**Integration:**` field tracks integration window correctly through one full PR cycle (Awaiting PR →
      Awaiting review → Changes requested → Awaiting review → Ready to merge → Merged → swept)
    - CHECK 16 blocks commits with invalid State or Integration enum values and enforces Integration only for
      `State: Complete`
    - Sweep eligibility check fires correctly (`State: Complete + Integration: Merged`)
    - `archive.cadence: with-integration` default operates as sweep-as-you-go; `manual` defers to user
      invocation
    - Existing active status files are valid under the tightened hook; no migration helper is introduced
- Cadence refinements observable in practice:
    - Step 6c → 8 pre-advance eliminates one metadata commit per integration cycle
    - Post-PR-creation eddy guidance referenced in handoff decisions during integration sessions
    - PR URL archival rule fills the durable link during archive without a post-PR metadata-only commit
- Failure-mode handling operates correctly:
    - Each of the five modes that fires recovers per the documented path (taxonomy in
      strategy-session-operations.md)
    - Rollback dev-rule applies cleanly to bad-state failures; not invoked for transit failures
    - Agent-crash mid-cascade surfaces correctly on session-resume with continue/rollback prompt
- Strategy-doc cascade lands:
    - strategy-team-coordination updated with interlock-release-aware coordination guidance
    - strategy-session-operations updated with interlock-config-aware load-set, deferred-review × commit-on-task-approval
      interaction, and failure-mode taxonomy
- Downstream consumer plans confirm the metadata-state foundation and independent interlock settings support
  their scope without structural
  reshape — verified by reading [plan-agile-wu-lifecycle][plan-awl]'s "Relationship" section against this
  PRD's deliverables before WU integration. Other downstream plans verified analogously.
- Validation window: 1–2 self-host sessions exercising the configured interlock release settings between SOF
  integration and the next downstream WU's activation. Vehicle: next post-SOF WU (likely plan-user-sync-ux).
  Observation log in `notes-session-operational-flow.md`. Concrete count and vehicle finalized at task-list time.

## Open Questions

**Resolve during work:**

- **Phase 3 split contingency.** If the metadata-state foundation surface estimates expand significantly
  during task generation, Phase 3 may split into a separate WU (`metadata-state-foundation`) shipping
  immediately after SOF. Current plan: bundle (the dogfooding case for configured interlock release operating
  against the new schema is real). Revisit at task-generation if surface scope grows past medium-large.
- **`archive.cadence: deferred` automatic-trigger semantic.** v1 drops the value (avoiding enum bloat
  without a defined trigger). If dogfooding surfaces a clear automatic-trigger pattern
  (e.g., "at next planning-branch activation" or "session-init prompts when pending sweeps exceed N"),
  the value lands as P1.a with the trigger baked into the name.
- **Pre-advance pattern generalization criteria.** Three criteria (mechanical + idempotent/detectable +
  low redo cost) documented in integrate-work-unit.md as the rationale for the Step 6c → 7 pre-advance.
  Whether to also document the criteria in strategy-session-operations.md for downstream-plan reference
  is P1.b — decided at task-list time based on whether downstream consumer plans reference the pattern.
- **arc-commit skill simple-path extraction approach.** Whether commit-on-task-approval reuses the skill's
  simple-path logic via literal-extraction (commit-on-task-approval imports skill code) or shared-helper (both
  call a common library). Decided at task-list time after inspecting the simple-path's actual shape after
  IF's late-stage skill thinning.
- **Validation-window vehicle confirmation.** Plan-user-sync-ux is the leading candidate as the next
  post-SOF WU (small, in-scope for parallel, consumes IF's handoff-interior toggle pattern). If
  scheduling shifts to a different downstream consumer first, the validation window rides whichever WU
  activates next.
- **Failure-mode #5 (agent crash mid-cascade) detection signal shape.** Session-resume scan for
  workflow-state pointer + uncommitted staged content. Exact pointer location and detection logic
  finalized at task-list time. May require workflow-state checkpointing infrastructure if the existing
  pointer mechanisms don't carry enough context.

---

[adr-016]: ../../reference/adr/adr-016-configurable-autonomy-interlocks-for-session-operations.md
[prd-foundation]: ../../reference/archive/2026-q2/technical/05_interlock-foundation/prd-interlock-foundation.md
[dev-rules-arc]: ../../reference/constitution/DEV-RULES.ARC.md
[strategy-team]: ../../reference/strategies/arc/strategy-team-coordination.md
[strategy-session]: ../../reference/strategies/arc/strategy-session-operations.md
[plan-sync]: ../../backlog/technical/plan-user-sync-ux.md
[plan-hooks]: ../../backlog/technical/plan-quality-gate-hooks.md
[plan-wf]: ../../backlog/technical/plan-worktree-foundation.md
[plan-awl]: ../../backlog/technical/plan-agile-wu-lifecycle.md
[plan-cwc]: ../../backlog/feature/plan-concurrent-work-conventions.md
