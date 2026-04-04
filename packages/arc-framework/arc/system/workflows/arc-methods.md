# ARC Methods

Default implementations for ARC's configurable conventions. Each method defines a contract (what must be
accomplished) and a default (how ARC does it out of the box).

**How overrides work:** To replace a default, fill in the method's `.override` section with your team's
implementation. For each method, the agent checks `.override` first. If populated, follow the override and skip
`.default`. Contracts are advisory: your override should satisfy the same invariant as the default.

**Loading model:** Method defaults and overrides load on-demand at workflow trigger points, not at session
initialization. Session-init scans only for override *presence* (which methods have active overrides) without
reading method content. Workflow documents include method dependencies blocks that trigger loading when the agent
reaches the relevant activity. See the [Context Loading Strategy][context-loading] for the tiered model and
ADR-013 for the decision rationale.

**Classification:** Configurable — preserved through three-way merge during framework updates. For the full
configurability model, see [Configurability Architecture Strategy][config-arch].

---

## Contents

- [Method Dependencies](#method-dependencies) — coupled override guidance
- [commit-format](#commit-format) — message structure, types, scope, body
- [commit-context-format](#commit-context-format) — context footer patterns
- [issue-triage](#issue-triage) — severity triage, fix-vs-defer decisions
- [test-first](#test-first) — decision tree by change type
- [session-state](#session-state) — reading and writing session state
- [pre-merge-review](#pre-merge-review) — aggregate diff review before push
- [review-triage](#review-triage) — classifying and acting on review findings
- [quality-gate-commands](#quality-gate-commands) — project quality gate definitions

---

## Method Dependencies

Overriding a method without updating its related methods may produce inconsistent behavior. Check related methods
when populating any `.override` section.

| Method                | Related Methods         | Coupling                         |
| --------------------- | ----------------------- | -------------------------------- |
| commit-format         | commit-context-format   | Both govern the commit message   |
| commit-context-format | commit-format           | Both govern the commit message   |
| issue-triage          | —                       | Independent                      |
| test-first            | —                       | Independent                      |
| pre-merge-review      | review-triage           | Uses review-triage for findings  |
| review-triage         | —                       | Independent                      |
| session-state         | —                       | Independent                      |
| quality-gate-commands | —                       | Independent                      |

---

## commit-format

**Workflow:** [prepare-commits.md][prepare-commits] · **When:** Agent writes a commit message

**Contract:** Commits follow a consistent, communicative format that enables automated tooling and readable history.

**Related:** [commit-context-format](#commit-context-format) — format changes may require context footer adaptation

### commit-format.override

[No override configured]

### commit-format.default

Conventional commit format.

```text
<type>(scope): Brief description (max 72 chars total, imperative mood)

- Key change or rationale (1-2 lines per bullet)
- Impact if significant
```

**Types:** `feat` `fix` `docs` `content` `style` `refactor` `test` `chore` `perf` `build` `ci` `config` `revert`

**Scope:** Lowercase functional area (e.g., `auth`, `api`, `tests`, `config`, `arc`, `deps`).

**Subject line:** Describe the change, not the task. Don't include task references, phase numbers, or other
traceability metadata — the `Context:` footer handles that (see [commit-context-format](#commit-context-format)).

**Body:** 10–15 lines max (20–25 for milestones). Focus on WHY and IMPACT, not what changed.

**Enforcement:** Git hooks validate format when `commit.format` is `conventional` or `custom`
in [`arc-config.yml`][arc-config]. See `system/githooks/README.md` for setup.

---

## commit-context-format

**Workflow:** [prepare-commits.md][prepare-commits] · **When:** Agent writes a commit message

**Contract:** Every commit includes a context footer linking it to its task or work context. Format must be
grep-searchable across commit history.

**Related:** [commit-format](#commit-format) — both govern the commit message structure

### commit-context-format.override

[No override configured]

### commit-context-format.default

`Context:` footer with task list reference or category.

**With task list:**

- `Context: tasks-[filename].md (Task X.Y)` — single task
- `Context: tasks-[filename].md (Tasks X.Y-X.Z)` — range
- `Context: tasks-[filename].md (Tasks X.Y, A.B)` — non-contiguous
- `Context: tasks-[filename].md (Tasks X.Y; planning)` — task + extra task list work
- `Context: tasks-[filename].md (incidental - discovered during <context>)` — incidental fix
- `Context: tasks-[filename].md (planning)` — task list metadata only
- `Context: tasks-[filename].md (activation)` — backlog to active transition
- `Context: tasks-[filename].md (integration)` — integration prep and review fixes
- `Context: tasks-[filename].md (archival)` — active to archive transition

**With atomic companion file:**

- `Context: atomic-[filename].md` — work-unit-scoped atomic task

Use `atomic-*.md` only for commits that complete work tracked in the companion file. Incidental
fixes discovered *during* an atomic task but not themselves tracked there use the task list
incidental pattern: `tasks-[filename].md (incidental - discovered during <context>)`.

**Without task list:**

- `Context: [category] (no associated task list)` — emergent work
- `Context: [category] (atomic / no associated task list)` — standalone small one-off work

**Categories:** `planning`, `documentation`, `maintenance`, `refactor`.

**With contributor role:**

- `Context: contribution (fix typo in README)` — freeform description
- `Context: contribution (implement feature per issue #42)` — issue reference
- `Context: contribution (add dark mode support)` — feature description

Contributors (`arc.role = contributor`) use the `contribution` context with a freeform
parenthetical describing the change. The parenthetical is not structured — describe what
the contribution addresses. This format is accepted from any role but is the expected
convention for contributor commits.

**Enforcement:** Git hooks validate context footer when `commit.context_footer` is `required` or `custom`
in [`arc-config.yml`][arc-config].

---

## issue-triage

**Workflow:** [process-task-loop.md][process-task-loop] · **When:** Pre-existing issues encountered in files being
modified (the "leave it cleaner" rule in [DEV-RULES.ARC][dev-rules-arc])

**Contract:** Given an issue found in a file you are modifying, return a decision: fix inline or defer. Deferred
issues route per the capture guidance in [DEV-RULES.ARC § Leave it cleaner][dev-rules-arc] — never to completion
notes or session notes.

### issue-triage.override

[No override configured]

### issue-triage.default

Severity-based triage.

**Assess severity and decide:**

- **Minor** (< 5 minutes): Fix immediately without asking
- **Moderate** (5–15 minutes): Fix immediately, document in commit message
- **Major** (> 15 minutes): Ask user for direction — fix now or defer

**Context-switching cost:** Time thresholds assume in-context work — the issue is in code you're
already reading. When an issue requires switching to a different domain or unfamiliar code, the
effective cost is higher than the raw fix time. Assess severity based on total attention cost, not
just fix duration. An issue in a completely different module is effectively major regardless of fix
time — surface it to the user rather than context-switching away from the current task.

**If fixing:** Note in commit message ("Also fixed X pre-existing issues").

**If deferring:** Route per [DEV-RULES.ARC][dev-rules-arc] § Leave it cleaner — the routing table determines
destination based on scope and PM mode. Never defer to completion notes or session notes.

---

## test-first

**Workflow:** [process-task-loop.md][process-task-loop] · **When:** Agent begins implementing any task

**Contract:** Assess whether tests should be written before implementation. The assessment must inform task structure.

### test-first.override

[No override configured]

### test-first.default

Decision tree by change type.

**Requires test-first** (red-green-refactor within the task):

- New data models or schemas
- New API endpoints or endpoint modifications
- New service classes or business logic
- Complex algorithms or data transformations
- Non-trivial validation or processing logic

**Test-after acceptable:**

- Simple CRUD operations with no custom logic
- Presentational UI components
- Configuration file changes
- Trivial refactoring (renaming, moving files)
- Documentation-only changes

**If unsure, default to test-first.** Writing tests after implementation is harder and less effective.

**Execution discipline — one behavior at a time:** The behavior list under the marker is a discovery guide, not a
batch spec. The default is vertical slices: write one test, make it pass, then write the next — each cycle informs
the next. Avoid writing all tests upfront then implementing; that tests *imagined* behavior, not actual behavior.
When behaviors are tightly coupled and slicing adds no discovery value, batching is acceptable — note the rationale
in the completion report so the decision is visible (see [process-task-loop][process-task-loop] § Batching judgment).

**During task list creation:** Group test and implementation together — by module or concern, not by activity.
A test-first task covers both writing tests and writing the code that makes them pass. Use the
`Build \`test-first\` (one behavior at a time):` marker line to introduce the behavior list — this signals the
executing agent to apply the red-green-refactor loop (see [process-task-loop][process-task-loop] for execution
details).

---

## session-state

**Workflow:** [session-init.md][session-init], [session-handoff.md][session-handoff] · **When:** Agent reads or
writes session state

**Contract:** Preserve session context across handoffs. State must be recoverable by a new agent or session.

### session-state.override

[No override configured]

### session-state.default

Read/write session state at session boundaries:

- **WORK-STATUS.md** (`active/`) — tracked project state, updated at commit time and handoff
- **SESSION-NOTES.md** (`user/{identity}/`) — gitignored personal context, written at handoff
- **Git notes** (`refs/notes/arc/user/{identity}`) — portability layer for the user directory.
  Save at handoff, load at init when local files are missing or stale. Push per `user.sync_push`
  config (`always` / `prompt` / `manual`; per-developer override via `git config arc.sync_push`).

---

## pre-merge-review

**Workflow:** [integrate-work-unit.md][integrate-work-unit] · **When:** After Phase 1 docs are committed, before push
and PR creation

**Contract:** Review aggregate changes before integration to catch cross-cutting issues that per-task review misses.
Gated by `review.pre_merge` in [`arc-config.yml`][arc-config] — when disabled, skip entirely.

**Related:** [review-triage](#review-triage) — use for finding classification

### pre-merge-review.override

[No override configured]

### pre-merge-review.default

Lightweight diff review before pushing. Catches issues that only emerge at the aggregate level — cross-task
inconsistencies, documentation drift, cleanup artifacts. Research consistently shows that self-review before
submission eliminates a significant proportion of review comments and catches issues that are trivial to fix
but compound if left for reviewers.

**Review the aggregate diff against the parent branch:**

```bash
git diff {parent-branch}...HEAD
```

**Check for:**

- **Scope**: Does every change serve the stated purpose? Look for unrelated modifications within legitimately
  changed files, not just accidentally staged files
- **Consistency**: Cross-task inconsistencies in naming, patterns, or approaches that diverged during
  incremental work
- **Cleanup**: Debug artifacts (logging statements, commented-out code, temp scaffolding), dead code from
  refactoring (unused imports, orphaned functions, stale references)
- **Documentation drift**: Docs or comments that no longer match the implementation
- **Unresolved markers**: TODO/FIXME items that should be resolved before merge

**AI-assisted code** (when an agent performed implementation): Verify business logic correctness — does the
aggregate change actually solve the stated problem? Check exception handling paths explicitly — AI-generated
code systematically underperforms on error cases and edge conditions.

**Process findings** using the [review-triage method](#review-triage) (fix/defer/reject/silent-fix). Run Tier 3
quality gates on modified files. Commit fixes with the `(integration)` context footer.

For structured review workflows (multi-pass, AI tool integration, team review protocols), override this method
or configure the [pre-merge-review extension][arc-ext-pre-merge-review] for additional ceremony.

---

## review-triage

**Workflow:** [integrate-work-unit.md][integrate-work-unit] · **When:** Agent processes findings from any code review
(self-review, AI tool, human reviewer)

**Contract:** Every review finding gets an explicit disposition. No finding is silently ignored. Dispositions are
documented in the commit message that addresses them.

### review-triage.override

[No override configured]

### review-triage.default

Four-way classification for each finding. Evaluate validity (real issue or preference?), context (conflicts with
documented deferrals? code scheduled for replacement?), and impact (functionality vs. code quality?).

**FIX NOW** if:

- Legitimate bug affecting current functionality
- Documentation inconsistency causing confusion
- Simple fix (<10 lines, low risk)
- Improves code being actively maintained

**DEFER** (document reason) if:

- Code is scheduled for deletion in next phase
- Already documented as strategic deferral
- Requires substantial refactoring of temporary code
- Part of a different feature/phase

**REJECT** (note reason) if:

- Conflicts with project standards
- Out of scope for current work
- Reviewer misunderstands the context

**SILENT FIX** (minor findings — no explicit documentation needed) if:

- Typo corrections, formatting improvements
- Minor code quality enhancements
- Simple clarifications that don't need justification

**Documenting dispositions:** Include in the commit message that addresses the findings:

```text
Fixed:
- [Finding 1 description]

Deferred:
- [Finding X]: [Brief reason]

Rejected:
- [Finding Y]: [Brief reason]
```

---

## quality-gate-commands

**Workflow:** [process-task-loop.md][process-task-loop] · **When:** Agent runs quality gates (Tier 1, Tier 2, or Tier 3)

**Contract:** Project-defined quality gate commands. Must return zero exit code on pass, non-zero on failure.

### quality-gate-commands.override

[No override configured]

### quality-gate-commands.default

Commands specified in [DEV-RULES.PROJECT][dev-rules-project] § Quality Gates. This is a passthrough by
design — no universal default command set exists across projects. The method exists so the process-task-loop
references quality gates uniformly through the method layer, and teams with non-standard setups
(environment-specific commands, conditional logic) have a clean override path.

---

[config-arch]: ../../reference/strategies/arc/strategy-configurability-architecture.md
[prepare-commits]: arc/supplemental/prepare-commits.md
[integrate-work-unit]: arc/work-unit-lifecycle/integrate-work-unit.md
[process-task-loop]: arc/3_process-task-loop.md
[session-init]: arc/session-lifecycle/session-init.md
[session-handoff]: arc/session-lifecycle/session-handoff.md
[arc-config]: ../arc-config.yml
[arc-ext-pre-merge-review]: arc-extensions.md#pre-merge-review
[context-loading]: ../../reference/strategies/arc/strategy-context-loading.md
[dev-rules-project]: ../../reference/constitution/DEV-RULES.PROJECT.md
[dev-rules-arc]: ../../reference/constitution/DEV-RULES.ARC.md
