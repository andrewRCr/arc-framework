# ARC Workflow Extensions

Project-specific extensions to ARC workflow steps. Each section corresponds to a preset extension point in an ARC
workflow document.

**How extensions work:** Each preset section defines a contract (when the extension fires and what it can do) and a
placeholder. To add behavior, replace the placeholder with your steps, checks, or guidance. The agent reads this
file when it encounters an extension point marker in a workflow — if the section has content, it executes the steps;
if the placeholder remains, it skips and continues. Extensions add behavior to workflows; they do not replace
existing steps.

**Classification:** Configurable — preserved through three-way merge during framework updates. For the full
configurability model, see [Configurability Architecture Strategy][config-arch].

---

## Contents

- [post-task-quality](#post-task-quality) — additional checks after each task
- [post-unit-quality](#post-unit-quality) — additional checks at coherent unit boundaries
- [post-task-completion](#post-task-completion) — additional actions after task marked complete
- [post-context-load](#post-context-load) — additional context loading at session start
- [pre-stage-review](#pre-stage-review) — additional staging verification before commit
- [pre-merge-review](#pre-merge-review) — structured review ceremony before merge
- [post-work-unit-activate](#post-work-unit-activate) — actions after work unit activation (PM layer interface)
- [post-work-unit-archive](#post-work-unit-archive) — actions after work unit archival (PM layer interface)

---

## post-task-quality

**Workflow:** [process-task-loop.md][process-task-loop] · **Fires:** After Tier 1 checks pass, before marking task
complete

**Contract:** Add quality checks that run after every task completion. Steps here run in addition to ARC's default
Tier 1 checks, not instead of them. Must return a clear pass/fail signal — the agent does not mark the task complete
if any check fails.

### post-task-quality.steps

[No extension configured]

---

## post-unit-quality

**Workflow:** [process-task-loop.md][process-task-loop] · **Fires:** After Tier 2 checks at coherent unit completion

**Contract:** Add integration-level checks for coherent unit boundaries (last subtask under a parent, or standalone
tasks touching integration-tested code). Supplements ARC's default Tier 2 checks. Must return a clear pass/fail
signal.

### post-unit-quality.steps

[No extension configured]

---

## post-task-completion

**Workflow:** [process-task-loop.md][process-task-loop] · **Fires:** After task marked `[x]` and description updated,
before verification and reporting

**Contract:** Perform additional actions when a task is completed. ARC's core behavior (marking `[x]` in the task list
file and updating the task description) is non-negotiable — this extension adds to it, not replaces it. Use for
external tracker updates (Jira, Linear), team notifications, or custom ceremony steps.

### post-task-completion.steps

[No extension configured]

---

## post-context-load

**Workflow:** [session-init.md][session-init] · **Fires:** After standard document loading (Step 2), before
orientation (Step 4)

**Contract:** Load additional project-specific context at session start. Use for team-specific documents, external
tool state, or environment checks that agents should be aware of before beginning work.

### post-context-load.steps

[No extension configured]

---

## pre-stage-review

**Workflow:** [prepare-commits.md][prepare-commits] · **Fires:** After staging changes, before creating the commit

**Contract:** Add staging verification steps beyond ARC's default `git diff --cached --stat` check. Use for
project-specific validations on staged content (security scanning, license headers, generated file checks).

### pre-stage-review.steps

[No extension configured]

---

## pre-merge-review

**Workflow:** [integrate-work-unit.md][integrate-work-unit] · **Fires:** After the [pre-merge-review
method][arc-methods-pmr] completes, before push and PR creation

**Contract:** Add review ceremony on top of the default pre-merge review. The [pre-merge-review
method][arc-methods-pmr] defines the base review activity (lightweight diff review by default, overridable);
this extension adds additional steps. Both are gated by `review.pre_merge` in
[`arc-config.yml`][arc-config] — when disabled, neither method nor extension fires.

Use for: AI review tool integration (CodeRabbit, Copilot, etc.), multi-pass review strategies, structured
human review protocols, or any additional ceremony beyond the method's review. When processing findings from
any review source, use the [review-triage method][arc-methods-rt] for classification
(fix/defer/reject/silent-fix).

### pre-merge-review.steps

[No extension configured]

---

## post-work-unit-activate

**Workflow:** [activate-work-unit.md][activate-work-unit] · **Fires:** After Core activation steps complete (branch
created, task list moved to active, WORK-STATUS updated)

**Contract:** Perform additional actions after a work unit is activated. Core PM artifact updates
(PROJECT-STATUS, ROADMAP) are handled by the workflow's built-in arc-in-git step — this extension is for
additional project-specific actions: external tool notifications, custom ceremony steps, or environment setup.
Without populated steps, the workflow proceeds naturally.

### post-work-unit-activate.steps

[No extension configured]

---

## post-work-unit-archive

**Workflow:** [archive-work-unit.md][archive-work-unit] · **Fires:** After Core archival steps complete (task list
archived, branch cleaned up)

**Contract:** Perform additional actions after a work unit is archived. Core PM artifact updates
(PROJECT-STATUS, ROADMAP) are handled by the workflow's built-in arc-in-git step — this extension is for
additional project-specific actions: cleanup scripts, external tracker updates, or team notifications.
Without populated steps, the workflow proceeds naturally.

### post-work-unit-archive.steps

[No extension configured]

---

[config-arch]: ../../reference/strategies/arc/strategy-configurability-architecture.md
[process-task-loop]: arc/3_process-task-loop.md
[session-init]: arc/session-lifecycle/session-init.md
[prepare-commits]: arc/supplemental/prepare-commits.md
[integrate-work-unit]: arc/work-unit-lifecycle/integrate-work-unit.md
[arc-methods-rt]: arc-methods.md#review-triage
[arc-methods-pmr]: arc-methods.md#pre-merge-review
[arc-config]: ../arc-config.yml
[activate-work-unit]: arc/work-unit-lifecycle/activate-work-unit.md
[archive-work-unit]: arc/work-unit-lifecycle/archive-work-unit.md
