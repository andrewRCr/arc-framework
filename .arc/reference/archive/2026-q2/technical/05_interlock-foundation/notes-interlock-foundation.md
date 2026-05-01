# Notes: Interlock Foundation

**Purpose:** Working notes companion to `tasks-interlock-foundation.md`. Primary content to
date is the post-integration validation-window plan (Phase 5.3 deliverable) and an in-flight
observation log capturing how the new frame behaved during this WU's own execution. Other
notes can land here as new top-level sections if any surface during the validation window or
post-archive review.

**Completed:** 2026-04-30 _(WU integration prep — validation window itself runs post-archive)_

---

## Contents

- [Validation Window](#validation-window) — plan for the post-integration window: definition,
  three-session exercise, failure-mode routing
- [Observations](#observations) — in-flight log from Phases 1–5 execution

---

## Validation Window

The post-integration validation window runs between WU-A (`interlock-foundation`) integration
and WU-B (`session-operational-flow`) activation, exercising the new frame end-to-end against
the success criteria flagged `(validation window)` in `tasks-interlock-foundation.md`.
Pre-integration deliverable; the window itself runs post-archive. Findings route per
§ Failure-Mode Handling below.

### Window Definition

**When it runs:** Between WU-A (`interlock-foundation`) integration and WU-B
(`session-operational-flow`) activation. The frame must be on `main` to exercise the dominant
post-integration paths — planning-branch ceremony reads from main, sessionType inference reads the
live status file at session-init, etc.

**Vehicle:** sibling-WU planning is the natural exercise — the `session-operational-flow` planning
sessions (plan-doc refinement → PRD → tasks) cover the breadth of the new frame without contrived
dogfooding scaffolding. The planning branch forks cleanly from main, no stacking on WU-A.

**Completion criteria:** all session-mapped success criteria below are observed in practice; all
`(validation window)` items in `tasks-interlock-foundation.md` § Success Criteria reach `[x]`.
Adjustments surfaced during the window route per § Failure-Mode Handling.

### Session Plan

Three sessions cover the dominant paths. The count is a soft target — extend if the planning work
surfaces more or if observations remain thin after three.

#### Session 1 — Planning-branch activation end-to-end

**Vehicle:** `plan-session-operational-flow.md` refinement on a fresh planning branch.

**Exercises:**

- `activate-planning-branch` ceremony executes against the plan-doc.
- Status file is created with `State: Planning`, `**Spec:**` pointing at
  `plan-session-operational-flow.md`, and `**Sibling Work Unit(s):**` back-referencing
  `prd-interlock-foundation.md`.
- Probe sessionType inference reads `State: Planning` as primary signal at session-init —
  branch-pattern fallback is not invoked in the dominant case.

**Success criteria covered:**

- _Planning-session active surface visible in practice: status file present at planning activation;
  sessionType inference works without branch-pattern fallback in the dominant case._

#### Session 2 — PRD generation under structured prompts + composite handoff probe

**Vehicle:** `1_create-prd.md` execution producing `prd-session-operational-flow.md`.

**Exercises:**

- Structured task-completion prompts (`Proceed to Task X.Y?`) appear at every task close.
- Boundary-aware variants fire at phase/WU end (`Proceed to Phase N+1, Task N+1.1?`,
  `Proceed to handoff?`).
- Manual-mode behavior preserved — no drift from pre-WU UX beyond the prompt addition.
- `arc status --session-handoff --json` returns the documented six-slot envelope at handoff.
- Status-file timing rule observable: task-completion commits stay code-only; status updates fire
  only at handoff or ceremony boundaries.

**Success criteria covered:**

- _Structured task-completion prompts appear at every task close in manual mode (boundary-aware
  variants at phase/WU end)._
- _Manual-mode preserves current behavior exactly — no drift acceptable for existing users._
- _Status-file timing rule observable in practice: task-completion commits don't touch status files;
  handoff and ceremony commits do._

#### Session 3 — Task generation + activate-work-unit idempotent transition

**Vehicle:** `2_generate-tasks.md` producing `tasks-session-operational-flow.md`, followed by
`activate-work-unit.md` Step 4 transitioning the existing planning-state status file.

**Exercises:**

- Idempotent `activate-work-unit` Step 4 transitions an existing planning status file
  (State: Planning → In Progress, Task List populated, fields aligned with execution shape).
- If a handoff fires both worktree-push and notes-push, the push-ordering invariant holds —
  worktree push lands before notes push.

**Success criteria covered:**

- _Push-ordering invariant holds in handoffs that fire both worktree and notes pushes._
- _Planning-session active surface visible in practice (transition path)._

#### Across all sessions

- _≥3 self-host sessions exercise the new frame per the validation-window plan._

#### Post-window verification

After the three sessions:

- Read each downstream consumer plan's Relationship section against this PRD's deliverables —
  confirm the frame supports their scope without structural reshape.
    - _Downstream consumer plans confirm the frame supports their scope without structural reshape._

### Failure-Mode Handling

Adjustments surfaced during the window route by type:

- **Probe envelope shape changes** (field added / renamed, slot semantics shifted) → post-archive
  R-task against this WU. The composite probe is constitutional surface; restructuring belongs to
  the WU that established it.
- **Structured-prompt phrasing changes** → fold into sibling WU (`session-operational-flow`) if the
  change is autonomy-mode-specific; otherwise post-archive R-task here.
- **Workflow prose adjustments** (handoff sequence, planning-branch ceremony steps, etc.) →
  post-archive R-task here; workflows are this WU's surface.
- **Status-file template adjustments** (new field, field reorder) → post-archive R-task here.
- **New configuration keys / autonomy enum changes** → sibling WU; auto-mode behavior is its scope.

Tag each adjustment in the observation log below with the routing decision when capture happens, so
post-window triage is mechanical.

## Observations

_Append-only log. Phase 5.3.b populates this section as the WU's own task work exercises the new
frame. Phases 1–4 entries are retrospective recall (those phases predate the log); Phase 5 captures
land in real time._

<!-- Entry format:                                                                  -->
<!-- ### <Phase X.Y> — <Brief title>                                                 -->
<!-- **Observed:** <what happened>                                                   -->
<!-- **Significance:** <why it matters for validation / which criterion it touches>  -->
<!-- **Routing (if adjustment needed):** <per § Failure-Mode Handling>               -->

### Phase 4.1 — Structured task-completion prompts

**Observed:** `Proceed to Task X.Y?` fired at every task close during Phase 5 execution (5.1.a →
5.1.b → 5.1 parent → 5.2 parent → 5.3.a). Single-keystroke `y` advance functioned. Boundary-aware
variants (`Proceed to Phase N+1, Task N+1.1?`) not yet exercised in this WU's own task work — no
phase boundary hit during the in-flight log window.

**Significance:** Supplemental evidence that base prompt behavior fires in manual mode. Phase/WU-end
variants remain to validate post-integration.

### Phase 4.1 — Status-file timing rule visible in git history

**Observed:** Task-completion commits during Phase 5 stayed code-only — neither the 5.1 content
commit (`feat(arc): validate Spec field shape on status-file commits`) nor the prior task-list
refinement (`docs(arc): pin design decisions for pending tasks`) staged the status file. The
session's handoff commit on the prior session boundary (`chore(status): handoff`, `edcca4f1`)
landed as a dedicated `chore(status):` per rule.

**Significance:** Confirms the timing rule operates in practice — task-completion commits don't
touch status; handoff and ceremony commits do.

### Phase 4.3 — Staging-as-test commit shape applied correctly

**Observed:** Two shapes landed this session — task-list-only (`docs(arc): pin design decisions for
pending tasks`) and content + task-list bundle (`feat(arc): validate Spec field shape on
status-file commits`). Status file did not bundle into either.

**Significance:** Confirms the relaxed shape rule (staging-as-test) operates pragmatically without
accidental status-file bundling. Adopter-friction reduction (one fewer commit per ceremony) was the
direct payoff.

### Phase 3 — Composite session-init probe at session start

**Observed:** `arc status --session-init --json` at session-init returned the documented envelope
cleanly (identity, user, worktree, extensions, config, active, domainRules). Orientation surfaced
`worktree.value.state: local-ahead` and the active status-file resolution end-to-end.

**Significance:** Probe shape consumable end-to-end. Planning-state surface itself not exercised
this session — the current WU resolved as `In Progress` execution; planning-active-surface
exercise is deferred to the post-integration window's Session 1.

### Phase 5.1 — CHECK 16 self-test on landing commit

**Observed:** On the 5.1 commit, the pre-commit hook fired CHECK 16 on the staged set. Status file
was not staged, so the candidate filter returned empty and the CHECK silently no-op'd. Hook output:
`Pre-commit checks PASSED`, no CHECK 16 prose surfaced.

**Significance:** Confirms validator inert-on-empty-candidates behavior — non-status commits don't
pollute output with status-related prose. Failure-path validation (malformed Spec value blocks
commit) is deferred to the post-integration window or to any incidental status-file edit before
then.

### Phases 1–3 — Retrospective rollup

**Observed:** Recall-only. No specific friction remembered during execution of the constitutional
vocabulary rename (Phase 1), configuration-surface landing (Phase 2), or planning-active-surface
plumbing (Phase 3). The PRD spec held; no design decisions reopened mid-execution.

**Significance:** Soft signal — absence of remembered friction is consistent with clean integration
but doesn't substitute for prospective capture. Real-time observation begins at Phase 4.1 with the
status-file timing rule and structured prompts going live.

### Phase 5 close — `arc-handoff` skill audit triggered by step-1 staleness

**Observed:** Initial `/arc-handoff` invocation followed the skill's literal step 1 and chained
`git status && git log -10` ahead of the composite probe — redundant with the envelope. Audit
surfaced three issues across the arc-handoff skill and session-handoff workflow: (1) skill step-1
text stale vs Phase 4.2's probe-first restructure; (2) workflow line 23 contaminated with
self-host `npx arc`; (3) skill structure had pure-duplication AND a silent semantic deviation
(step 3 encoding a manual-commit prompt override that belongs in the workflow).

**Significance:** First validation-log entry surfacing a real adjustment rather than
positive-evidence. Confirms the § Failure-Mode Handling routing is workable in practice — workflow
prose drift is discoverable via use and fixable in-WU. Also surfaced a contract-clarification
opportunity: skill-invoked workflow commits (arc-commit, arc-handoff) operate under
skill-invocation approval rather than per-commit prompts; manual-commit's per-commit gate applies
to agent-discretion commits (process-task-loop), not user-invoked workflow bundles.

**Routing:** Inline to Phase 5 as Task 5.4 (validation-result correction). No post-archive R-task
needed — the surface touched belongs to Phase 4.2's restructure, naturally folded into the same WU.

### Validation Window Session 1 — Session-init next-work discovery fired in planning session

**Observed:** Session-init resolved the active status file `status-session-operational-flow.md` with
`**Task List:** [none]` (planning state). Step 5 next-work-unit discovery read this as "between work
units" and triggered ROADMAP.md inventory — even though the planning WU itself is the active work.

**Significance:** Planning sessions don't have a task list yet by definition; the discovery gate
needs to recognize them as active rather than between-units. Surfaced at session-init of the SOF
planning branch — exactly the dominant Validation Window Session 1 path.

**Routing:** Workflow prose adjustment per § Failure-Mode Handling. Fixed inline (commit `ebad242`)
rather than post-archive R-task — small, self-contained edit; deferring would have left the bug live
across additional planning sessions.

### Validation Window Session 1 — ROADMAP / backlog paths unspecified in session-init prose

**Observed:** Step 5 next-work-unit discovery referenced "ROADMAP.md" and "the backlog" without
spelling the paths. Agent had to infer locations during the same session that surfaced the
discovery-gate bug above.

**Significance:** Verification rule (DEV-RULES.ARC § Verification and Discovery) places the burden
on agents not to fabricate paths — but workflow prose was forcing the guess. Same friction the
composite probe was designed to remove for active-file resolution.

**Routing:** Workflow prose adjustment per § Failure-Mode Handling. Fixed inline (commit `ebad242`,
same change set as the discovery-gate fix) rather than post-archive R-task.

### Validation Window Session 2 — Spec field backtick-wrapping convention unspecified

**Observed:** During SOF PRD generation, the `**Spec:**` value on the SOF status file was updated
from `plan-session-operational-flow.md` to `prd-session-operational-flow.md` without backtick
wrapping — matching the un-wrapped form `activate-planning-branch.md` Step 5 produced at planning
activation. User caught the drift; the established convention (visible in IF's own status file:
`` `prd-interlock-foundation.md` ``) is that `.md` filename values are wrapped in code spans.
CHECK 16's validator explicitly strips a single wrapping pair (`validate-status-spec.ts:64`),
suggesting the implementer anticipated both forms in practice — but the workflow and template
prose didn't pin the authoring convention.

**Significance:** Convention exists de facto and matches markdown norms (filenames render as code
spans for visual distinction and to dodge autolink/punctuation interpretation). Workflow gap rather
than validator bug — the field-shape contract accepts both forms; the authoring guidance was silent.
Same friction class as the prior Validation Window Session 1 entries: workflow prose forcing the
agent to infer convention from sibling artifacts rather than reading it directly.

**Routing:** Workflow prose adjustment per § Failure-Mode Handling. Fixed inline:
`template-status.md` field-semantics preamble gains the wrapping rule covering `.md` and URL values;
`activate-planning-branch.md` Step 5 item 3 (Spec instruction) specifies the backticked code span
form. Both edits applied to package source and `.arc/` instance copies.

---
