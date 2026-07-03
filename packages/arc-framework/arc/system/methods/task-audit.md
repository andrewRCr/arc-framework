---
name: task-audit
description: Rubric method auditing tasks against the codebase — grounding floor plus eight issue categories at two depths.
override-active: false
---

# Method: task-audit

> - **Workflow:** [generate-tasks.md][generate-tasks]
> - **When:** Task generation runs its grounding-audit gate over a just-written phase, or an ad-hoc run audits
>   tasks-as-written before or during implementation — a pre-impl pause or a mid-impl reground — via the
>   [`arc-task-audit` door][arc-task-audit-skill].
>
> - **Signature:** `task-audit(scope, depth?) → findings`
> - **Contract:** Given a task scope, verify the tasks against the codebase they will execute in — a grounding
>   floor always, the eight-category analysis at `full` depth — and report structured findings with recommended
>   actions. Read-only: no edits, no implementation; the caller decides what resolves before work begins.

## task-audit.override

[No override configured]

## task-audit.default

`task-audit` audits **tasks against code** — the last link on the derivation chain intent → design → tasks →
code, as [`design-audit`][design-audit] audits the first. A task list is a claim about the codebase it will
execute in; this rubric checks that claim before implementation stakes work on it.

**Named inputs:**

| Input   | Kind     | Contents                                                                                                     |
|---------|----------|--------------------------------------------------------------------------------------------------------------|
| `scope` | required | Which tasks to audit — a single task, a range, a phase, or the full task list.                               |
| `depth` | optional | `full` (default) — grounding plus the eight-category analysis; `grounding-only` — the grounding floor alone. |

**Scope reading.** For single-task audits, read the task and its immediate neighbors (predecessor and successor)
for ordering context. For phase or multi-task audits, read the full phase and skim adjacent phases for
cross-phase dependencies.

**Grounding floor — always runs.** Read the codebase context each task touches:

- For every file, function, module, or interface referenced or implied by the task description, verify it exists
  and inspect its current state.
- Note any drift between the task description and what the code actually looks like — renamed functions, moved
  files, changed signatures, deleted modules.
- Check imports, exports, and call sites to understand the dependency surface.

At `grounding-only` depth, the grounding results are the entire finding set — report exists / missing / drifted
and stop there.

**Eight-category analysis — `full` depth.** Analyze each in-scope task against:

- **Unexposed assumptions** — the task assumes something about codebase state, available APIs, data shapes, or
  environmental conditions that isn't verified or stated. Flag what the assumption is and what breaks if it's
  wrong.
- **Masked design decisions** — implementation will force a choice (naming, interface shape, error-handling
  strategy, module boundary) the task doesn't acknowledge. Surface the decision and its alternatives.
- **Codebase drift** — gap between the task description and actual code: renamed functions, moved files, changed
  interfaces, deleted modules, or new code added since the task was written.
- **Ordering and dependency risks** — the task assumes a prior task's output without saying so, or would be
  materially easier in a different sequence. Flag hidden dependencies and suggest reordering if warranted.
- **Scope ambiguity** — the description could reasonably be read as two or more different scopes of work. Flag
  where the boundary is unclear and what the interpretations mean for effort and impact.
- **Interface contracts** — the task creates something a later task consumes, but the shape, contract, or API
  surface isn't specified. The later task will have to guess, or the implementer will backtrack.
- **Test strategy gaps** — a `test-first` behavior list misses error paths or edge cases; a task modifies shared
  code with no integration coverage mentioned; listed tests exercise imagined interfaces rather than actual ones.
- **Missing acceptance criteria** — no clear definition of "done" beyond "implement X." Flag tasks where
  completion is ambiguous.

**Structured findings.** Group findings by category (not by task), each finding referencing the specific task(s)
it applies to. For multi-task audits, open with a brief cross-cutting summary: overall readiness, highest-risk
tasks, systemic patterns. If the audit is clean, say so briefly — don't manufacture concerns.

**Two-tier disposition — the standalone output contract.** Standalone runs (and the task-generation gate) tag
each finding:

- **Fix before starting** — the task description should be updated or a design decision resolved before
  implementation begins.
- **Carry as context** — not a blocker, but the implementer must be aware of it during execution. The implementer
  may be a *different, later session* — possibly several sessions downstream — so a carry-as-context finding is
  useful only if recorded durably, never left in the audit conversation alone.

**Give carry-as-context findings a durable home.** Record each where the implementing session will meet it:
absorbed into the relevant task's description, or, when a `notes-{name}.md` companion exists, documented there
and cross-referenced **explicitly from the task-level description** (not the phase) so it is read at impl time. A
significant finding with no notes file is a signal to create one. Sole exception: an audit scoped to a single
task the auditing agent is about to implement directly — the context lives in its own working memory.

**Recommend actions.** For fix-before-starting findings, suggest specific task-description edits, missing
subtasks, or design decisions to resolve. For ordering risks, suggest concrete resequencing with rationale. Do
not implement fixes — present findings and let the caller decide how to proceed.

### Severity interpretation

Through the `adversarial-review` mechanism, findings map into the fixed `blocker` / `major` / `minor` enum the
[severity model][adversarial-review] owns — the rubric maps *into* the enum and never extends it. What each level
looks like for a task list:

- **`blocker`** — the gate cannot certify the tasks against their design: an ungrounded referent that makes a
  task unexecutable as written, a masked decision that reopens design, an assumption that — if wrong —
  invalidates the decomposition itself.
- **`major`** — a substantive grounding or planning problem that should resolve before implementation: a hidden
  ordering dependency, materially divergent scope readings, an unspecified interface contract a later task
  consumes, a test-strategy gap on shared code.
- **`minor`** — residue: cosmetic drift (a rename that doesn't change behavior), wording, a marginal
  acceptance-criteria gap where completion is still inferable.

**Two-axis reconciliation.** The native tiers above are **dispositions**, not severities — the two axes compose
rather than compete:

- *Fix before starting* ≈ a higher-severity finding (`blocker` / `major`) carrying a fix-here disposition.
- *Carry as context* is the carry-forward disposition, available at **any** severity — carrying a finding forward
  durably resolves it for the caller without flattening its severity.

Run through the mechanism, the rubric reports **severity** (the materiality claim) and the primary assigns
**disposition** at verification. Standalone runs keep the native two-tier as their output contract — the tags are
already dispositions, which is exactly what a directly-consuming caller needs.

---

[generate-tasks]: ../workflows/arc/generate-tasks.md
[design-audit]: design-audit.md
[adversarial-review]: adversarial-review.md
[arc-task-audit-skill]: ../.internal/skills/arc-task-audit/SKILL.md
