---
purpose: Execute tasks from ARC task lists — completion protocol, quality gates, stops, and incidental work routing.
audience: agent
arc:
  methods:
    - issue-triage
    - quality-gate-commands
    - testing-standards
    - validate-criteria
  extensions:
    - post-task-quality
    - post-unit-quality
    - post-task-completion
---

# Workflow: Task Processing Loop

## Task Implementation

Before implementing the current task, inspect whether an already-bound delivery requires correction routing:

```bash
printf '%s\n' '{"entryMode":"execution"}' | arc delivery entry inspect --input - --json
```

Dispatch only on the typed result. `not-applicable` continues below. `correction-routing-required` carries its exact
`selectedDeliverableId` and `entryMode` into the `plan-review-fix` correction route in
[`supplemental/deliver-stack.md`](supplemental/deliver-stack.md) before authoring or publishing the task's change.
`review-fix-verification-required` carries its exact `verification` and `acknowledgementInput` into that workflow's
review-fix verification continuation without replanning or repeating provider mutation.
`resume-bound` enters that workflow's `read-position-and-reconcile` route; after its typed recovery settles the active
operation, rerun the entry inspection before implementing the task. `canonicalize-provisional` resumes the matching
delivery-entry route. `refused` renders `recommendedActionText` and stops; any other result also stops as an
execution-entry contract violation.

- **One task at a time:** Each checkbox in the task list is one review increment — a bounded unit of
  autonomous execution between human review points. Complete one, mark it `[x]`, report, and **stop**
  for user approval.

- **Co-development awareness:** The developer may be editing files or making commits alongside you.
  Treat parallel changes as expected context, not interruptions. If changes conflict with your
  current task, flag the conflict and ask how to proceed.

- **Additional context pointers:** Before implementation, inspect the current task body for a root-level
  `**Additional Context:**` line. Read every listed target unless it is already loaded in this session;
  narrow to the named section when one is provided. If a pointer is vague, missing, or unreachable, resolve the
  closest source you can and surface the gap before relying on the task plan.

- **Test-first execution:** When a task has a ``Build `test-first` (one behavior at a time):`` marker
  (per the [testing-standards method][arc-methods-ts]), execute as vertical slices — one behavior at a time:
    1. **RED:** Write one test for one behavior listed in the task → run it → confirm it fails
    2. **GREEN:** Write minimal code to make it pass
    3. **REFACTOR:** Review the code you just wrote. If you see duplication, unclear naming, or an
       abstraction emerging — refactor now (all tests must stay green). If the code is clean, move on.
    4. Next behavior → repeat from RED

  Test cases listed in the task are behaviors to cover, not an execution sequence — let each cycle
  inform the next.

  **Batching judgment:** When behaviors are tightly coupled (single function, shared setup, no
  independent discovery value), batching tests before implementing is a pragmatic alternative to
  strict one-at-a-time slicing. When you batch rather than slice, note the rationale briefly in
  your completion report to the user (e.g., "behaviors tightly coupled, single-pass
  implementation") — not in task list completion notes. This makes the decision visible during
  review without bloating the persistent record.

- **Testing discipline:** Before implementing, if the task writes or modifies tests, apply the
  [testing-standards method][arc-methods-ts] — its assertion / mocking discipline plus any project override
  (boundaries, fixtures, tier specifics). Fires on every test-touching task, marker or not, so test-after work
  is covered too.

- **Issue triage:** When you encounter pre-existing issues in files you're modifying,
  follow the [issue-triage method][arc-methods-it] for severity assessment and fix-vs-defer decisions.

- **Completion protocol:**

  1. When you finish a **single task** (one checkbox item):
     - **First**: Run incremental quality checks on modified files — **Tier 1** — using the
       [quality-gate-commands method][arc-methods-qg]
       - Task list may specify additional checkpoints (including E2E) — those are mandatory; otherwise
         use judgment on whether changes warrant extra validation
     - **Extensions** · `#post-task-quality`: If `post-task-quality` appears in the active-extensions list
       (established at session init), load and execute its [`.actions`][arc-ext-task-quality]. Otherwise, skip.
     - **Second**: Prepare the task's completion edit; apply the final `[x]` in item 4 after any coherent-unit and
       delivery-member checks have completed
       - Update task description to reflect actual work done (not just original plan)
       - **No inline dates**: Don't add completion dates to individual tasks (e.g., "Completed: 2025-11-02"). Inline
         dates become temporal noise during archival. WU-level completion date lives on the completion doc's
         `**Completed:**` field; no task list or per-task date stamp is expected.
       - **Completion notes — content discipline.** At `[x]`, **`_Goal:_` is preserved verbatim**.
         **Replace** pre-completion peer descriptors (`_Note:_`, `_Rationale:_`, `_Approach:_`,
         `_Context:_`, `_Shape:_`) and Goal-children (description bullets, Build test-first lists)
         with a single `_Outcome:_` bullet at root — peer to Goal, **placed after the subtasks**
         (Goal opens; Outcome closes from below). Don't accumulate plan AND outcome.

         **Add an Outcome only when it earns signal** — one of: **synthesis** (emerges from the
         union of subtasks; not in any one subtask's notes), **verification** (non-trivial closure
         of the Goal loop, not a hollow mirror), or **cross-cutting impact** (downstream consequence
         spanning subtasks). Test: would a reviewer lose anything they couldn't derive from subtask
         notes or Goal? No → skip.

         **Granularity:** at most one Outcome per closing cascade, at the deepest parent whose
         scope matches the work-unit-of-this-commit. Ancestors that mechanically `[x]` from cascade
         take no new Outcome.

         See [strategy-task-list-formatting § Goal/Note Lines][strat-tlf] for full pre/post shape.

         **Include:** what changed (key files/symbols when not obvious from the title); decisions worth
         preserving — only when the choice would surprise a reader; cross-references to the commit, ADR, or
         `notes-{name}.md` for deeper context.

         **Exclude:** quality-gate outcomes (`[x]` already implies they passed; metrics like "840/840 tests"
         or "Tier 2 clean" are noise); per-decision rationale already in the commit body or `notes-{name}.md`
         (link, don't restate); test-batching / sequencing narrative (mention only if deviating from project
         default); process narration (what was tried, debugging steps, mid-task discoveries); forward planning
         (belongs in next task entry or Next Action).

         **Soft cap:** ~3 lines for atomic subtasks, ~6 lines for parent tasks summarizing rolled-up scope.
         Longer content belongs in `notes-{name}.md`.

         **Per-subtask outcome content:** the indented description bullet under each subtask shifts from plan
         to outcome at `[x]`. Same shape, no label change — the indent under a `[x]` already signals "what
         got done."
       - **Deferred or superseded tasks**: When a task is intentionally skipped — deferred to a later work
         unit, made irrelevant by a design decision, or superseded by a different approach — mark it `[~]`
         instead of `[x]`. Add a brief outcome note explaining why (e.g., "Deferred to WU3", "Superseded by
         ADR-011"). This distinguishes deliberate deferrals from incomplete work (`[ ]`).
       - **Do not update `meta-{name}.md` at this step.** See [DEV-RULES.ARC][dev-rules-arc]
         § Meta-file timing.
     - **Third**: Verify the task work before the boundary checks below.

     **Deferred-review policy for item 4:** When the user explicitly requests continuation through a specific set
     of tasks (e.g., "work through tasks 5.2-5.4 while I'm away"), the mandatory stop between
     those tasks is deferred. The user defines the scope — the agent never self-invokes this.
     Complete only the specified work — update the task list and run quality gates after each
     task, but continue to the next without waiting for approval. Leave the task list updated,
     quality gates passing, and changes uncommitted (user decides commit boundaries when they
     return). Under `arc.commitInterlock ∈ {on-task-approval, on-workflow}`, deferred review
     safe-accumulates by default — no per-task commit release within the deferred range. See
     [strategy-session-operations][session-ops] § Deferred-Review × Commit-Interlock Release for the explicit
     opt-in syntax.

     **Agent-proposed batch (atomicity-keyed).** A deferred-review scope may also originate from an agent
     _proposal_, not only a user request — without breaking "the agent never self-invokes": the agent
     proposes the scope, the user approves, and that approval is the invocation. At a parent task's entry,
     weigh whether its subtasks form one increment:

     - **Propose batching** when the subtasks will land as **one atomic commit** — one concern decomposed
       for _planning_, not _delivery_; the review boundary should track the commit boundary. Secondary
       signals: shared-artifact rework whose intermediate states are individually incoherent;
       cross-subtask interdependence.
     - **Keep per-leaf** when a subtask carries a design decision needing course-correction before the
       next, or each leaf is independently revertable / shippable.

     When the signals fire, surface a one-line proposal naming the scope ("4.2's subtasks a–d land as one
     commit — review 4.2 as a single increment?") and await approval; on approval, run them as a
     deferred-review batch closing at the parent. The proposal is **signal-gated and fires once per
     parent** — independent subtasks draw none, so there is no per-task approval tax. The default stays
     per-leaf and is never silently widened; the user may **pre-authorize** a standing "batch when it
     makes sense" for zero approvals.

     Stop when the specified scope is complete, or earlier if a stop condition is met:

     - **Must stop:** quality gate failure that can't be auto-fixed, blocking dependency on
       another task or external input, unanticipated design decision that needs user input,
       or scope significantly exceeding expectations for the task
     - **Continue with note:** auto-fixable lint issues (fix and note), task taking longer
       than expected but progressing, minor deviation from plan that doesn't change outcomes

     Stop conditions are not suspended by deferred review — a non-auto-fixable gate failure
     ends the deferred scope early and surfaces the issue to the user.

  2. **Coherent unit completion:** If the task you just finished completes a coherent unit of work —
     the last incomplete subtask under a parent, a standalone task that modifies
     cross-cutting code (shared services, middleware, configuration, API contracts), or
     the last task assigned to a delivery member — follow this additional sequence. Note: phase headers are
     organizational groupings, not trackable items — phase completion is implicit when all tasks
     within the phase are complete.

    - **First**: Ensure new code has appropriate test coverage for new or modified logic
    - **Second**: Run quality gates — **Tier 2** — using the [quality-gate-commands method][arc-methods-qg]
    - **Extensions** · `#post-unit-quality`: If `post-unit-quality` appears in the active-extensions list
      (established at session init), load and execute its [`.actions`][arc-ext-unit-quality]. Otherwise, skip.
    - **Third**: Verify completion before reporting (use pre-report checklist below)

  3. **Delivery-member boundary (conditional):** When this is the last task assigned to a delivery member, run the
     member's criteria walk after the coherent-unit checks and before completing or reporting the task. Record the
     returned evidence as the task's ordinary completion outcome and leave every Success Criteria checkbox unchanged
     for terminal verification. If the report contains an unresolved `[ ]`, dispatch to item 4's unresolved branch;
     otherwise dispatch to its resolved completion branch.

     ```yaml
     validate-criteria:
       scope:
         kind: delivery-member
         criteria: member group in the task list's Success Criteria section
         diff: bounded diff for this member
         reachability: cumulative tree through this member
     ```

  4. **Report and stop:** Use the resolved completion branch when item 3 does not apply or reports no unresolved
     criterion. Use the unresolved member-report branch only when item 3 returns an unresolved `[ ]`. Then stop
     through the shared interlock.

     **Unresolved member-report branch:** When item 3 returned an unresolved `[ ]`, leave the closing task `[ ]`.
     Preserve the report as boundary evidence, but do not cascade parent completion, run the completion extension,
     or apply the completion-only checklist. Report the unresolved criteria, evidence span, and verification status,
     then end with `Member criteria unresolved: <details>. Fix now or amend/defer?`. Do not execute the resolved
     completion branch.

     **Resolved completion branch:** Finalize the task completion and report it through the ordinary task interlock.

     - **First**: Mark the task `[x]`, cascade its parent to `[x]` when all subtasks are complete, and finish the
       prepared completion note. When item 3 fired, include the returned criteria evidence and span in that outcome.
     - **Delivery correction acknowledgment (conditional):** When the delivery continuation returned an
       `acknowledgementInput`, pass that exact object unchanged to:

       ```bash
       arc delivery review-fix acknowledge - --json
       ```

       Only `acknowledged` or `already-acknowledged` continues to the completion extension. `refused` renders its
       reason and stops with the pending continuation intact; never reconstruct or refresh the acknowledgment input.
     - **Extensions** · `#post-task-completion`: If `post-task-completion` appears in the active-extensions
       list (established at session init), load and execute its [`.actions`][arc-ext-task-completion].
       Otherwise, skip. Teams using external trackers (Jira, Linear, GitHub Issues) use this extension to
       sync task completion status — see [Team Coordination Strategy][team-coordination] § External Tracker
       Integration.
     - **Second**: Verify completion against the pre-report checklist.

     **Pre-Report Checklist** (verify before generating the completion report):

     ```
     - [ ] Quality checks passed (Tier 1, plus Tier 2 when item 2 applied)
     - [ ] Task list file edited and saved
     - [ ] Task marked [x] and description updated to reflect actual work
     - [ ] Member report recorded and Success Criteria unchanged (when item 3 applied)
     - [ ] Ready to report completion to user
     ```

     - **Third**: **REPORT** completed work to the user with a summary of changes.
     - **Fourth**: ⛔ **MANDATORY STOP** - Wait for user approval before proceeding.
       - **Structured prompt** — end the completion report with `<Prefix> <Target>?`:
           - **Prefix:** `Proceed` (default — `arc.commitInterlock: manual`) or
             `Commit and proceed` (when `arc.commitInterlock ∈ {on-task-approval, on-workflow}`).
           - **Target:** `to Task X.Y` (next task in phase) · `to Phase N+1, Task N+1.1` (current
             task ends the phase) · `to prepare-work-unit` (verification complete — execution end).
       - **Response semantics:** Short affirmative ("y", "yes", "ok") as first word advances.
         Under `Commit and proceed`, the affirmative covers both halves; `y; <redirect>` keeps
         the commit and replaces only the advancement target (handoff, deferred range, and
         prepare-work-unit are all valid retargets). A redirect that questions just-finished work
         (`y; hold the commit`, `y; revisit X first`) breaks the bundle — pause and ask.
       - **Implied permission:** User approval ("looks good", "proceed") implies permission to
         continue to the next task UNLESS explicitly stated otherwise. Address any stated concerns
         before moving on.

     If any checklist item is unchecked, complete it before reporting. For quality gate failures: fix obvious
     issues (lint, type errors) and re-run. Diagnose a non-obvious failure before posing it, then end the completion
     report with `Quality gates failed: <details>. <cause>. Fix now or defer? (fix / defer)`. If diagnosis reaches
     no cause, say so and ask for direction.

> [!IMPORTANT]
> `task-interlock`: Stop after reporting task completion. Surface verification status and await
> approval before advancing.

  5. Await user instructions on how to proceed.
     User may choose to commit changes or request modifications. Under
     `arc.commitInterlock: manual`, task approval advances work only; committing remains an
     explicit user-invoked action. Under `on-task-approval` (or `on-workflow`, which subsumes it),
     the commit-interlock releases on task approval per
     [Configurability Architecture Strategy][config-arch] § Session interlocks; on
     approval signal, invoke the [arc-commit skill][arc-commit-skill] — it owns the
     simple-vs-complex path decision and loads the format methods. After the commit lands, start
     the bundle's named target immediately without re-prompting. Complexity criteria bump to
     manual-with-prompt rather than invoking prepare-commits silently.

     **Atomicity check (before staging):** Do all changes serve one logical concern? When in
     doubt, split and ask. See [Commit Discipline][dev-rules-arc].

## Crash Recovery

On session resume after a suspected agent crash mid-cascade, run the recovery scan: read the active
meta file's `**Next Action:**` workflow-step pointer, then inspect `git status --porcelain`,
`git diff --cached --stat`, and recent commits (`git log --oneline -n 10`). Surface any mismatch between
the workflow pointer, staged changes, and commit history; prompt the user to continue the interrupted
cascade or roll it back. Full per-mode recovery procedures live in [Session Operations Strategy][session-ops]
§ Failure-Mode Recovery.

## Verification Phase

Every task list ends with a verification phase — a single task that points to the
verification workflow. Load the workflow and follow it; the task description is a pointer,
not a standalone instruction.

**→ [verify-work-unit.md](work-unit-lifecycle/verify-work-unit.md)** ← Load and follow for the verification task

## Next Step

When all tasks are marked complete and the verification phase has passed, proceed to Candidate preparation:

**→ [prepare-work-unit.md](work-unit-lifecycle/prepare-work-unit.md)** — Private review, convergence, and the
publication transition. Public integration follows through `integrate-work-unit.md` after `arc publish`.

## Incidental Work Management

When work surfaces mid-task that should be fixed, route it by urgency × isolation — fix inline
(same concern), run an Errand (out-of-WU), or capture to `USER-INBOX` for later. See
[DEV-RULES.ARC][dev-rules-arc] § Discovered Work Routing for the full decision table: the
atomic-vs-multi-step call, capture routing, and where captures drain.

### Atomic Task Completion

When you complete an atomic task in a shared inbox (`ATOMIC-INBOX` or `USER-INBOX § Errand`), follow this protocol:

1. **Mark `[x]`** and update the description — trim planning scaffolding (problem statement,
   research steps, options to evaluate) to outcomes (what was done, key decisions, files changed).
   Same principle as task list completion notes.
2. **Reorder** — move the completed task below all incomplete tasks (`[ ]`). Among completed tasks,
   maintain completion order: oldest completed first, most recently completed last. This keeps
   pending work immediately visible when the file is opened.
3. **Verify ordering** — incomplete tasks at the top, then a visual gap (blank line), then
   completed tasks in chronological completion order.

### Incidental Commit Discipline

Off-workflow / incidental commits follow the review-increment invariant
([DEV-RULES.ARC][dev-rules-arc] § Review-Increment Invariant): surface what landed (file list,
summary, or diff sample), then end with the structured prompt — `Commit and proceed to
<next-target>?` (releasing) or `Proceed?` (manual). The affirmative covers both work AND commit.
Informal mid-discussion approval ("ok", "looks good") does not release commit.

## Task List Maintenance

### Session-Scoped Tracking vs Task List Files

Ephemeral task tracking tools (e.g., TodoWrite) are **not a substitute for task list markdown
updates**. Always update the task list file before reporting completion.

### Updating Task Lists

- Add new tasks as they emerge during work
- Track file changes via git (no need to manually maintain file lists)

---

[config-arch]: ../../../reference/strategies/arc/strategy-configurability-architecture.md
[dev-rules-arc]: ../../../system/rules/DEV-RULES.ARC.md
[arc-ext-task-quality]: ../../extensions/post-task-quality.md
[arc-ext-task-completion]: ../../extensions/post-task-completion.md
[arc-ext-unit-quality]: ../../extensions/post-unit-quality.md
[arc-methods-ts]: ../../methods/testing-standards.md
[arc-methods-it]: ../../methods/issue-triage.md
[arc-methods-qg]: ../../methods/quality-gate-commands.md
[team-coordination]: ../../../reference/strategies/arc/strategy-team-coordination.md
[arc-commit-skill]: ../../.internal/skills/arc-commit/SKILL.md
[session-ops]: ../../../reference/strategies/arc/strategy-session-operations.md
[strat-tlf]: ../../../reference/strategies/arc/strategy-task-list-formatting.md
