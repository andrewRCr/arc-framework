# Commit Guide

**Audience:** Agent-executed at developer's direction — agent NEVER initiates commits without explicit approval.

**Purpose:** Guide for commit scenarios that need more than staging and committing. For straightforward
commits (single task, clear scope), the [commit-format][arc-methods-cf] and
[commit-context-format][arc-methods-ccf] methods plus git hook validation are sufficient — you don't need
this guide.

**Method dependencies (load on first reference):** This workflow references two arc-methods. When first
encountered, load the relevant section of [`arc-methods.md`][arc-methods] — check `.override` first; use
`.default` if no override is configured.

- [commit-format][arc-methods-cf] — message structure, types, scope, body
- [commit-context-format][arc-methods-ccf] — context footer patterns

## When to Use This Guide

- Multiple tasks accumulated without committing
- Uncommitted work spanning multiple sessions
- Interleaved changes across tasks that need separating
- Uncertainty about what should be one commit vs. multiple
- Session-end commits with mixed completed and partial work

## Quick Commit Reference

For simple, single-concern commits where you know what changed:

1. `git status` — review pending changes
2. `git --no-pager diff --stat` — overview of scope
3. Update task list and WORK-STATUS.md if committing completed task work (see
   [DEV-RULES.ARC][dev-rules-arc] § Work status accuracy) — stage with the commit
4. Stage files for one logical change
5. Pre-stage review extensions · `#pre-stage-review`: If [pre-stage-review extensions][arc-ext-pre-stage] are
   configured, execute them now
6. Commit using the [commit-format][arc-methods-cf] and [commit-context-format][arc-methods-ccf] methods
7. Git hooks validate automatically

## Atomicity Guide

**One logical change per commit.** When deciding how to split accumulated work, group by concern:

1. Core functionality (new features, major logic)
2. Configuration/infrastructure (settings, configs)
3. Tests (test files, test configurations)
4. Documentation (task list updates, strategy docs)
5. Code formatting (linting fixes, style)
6. Dependencies (package manifests, lock files)
7. Cleanup (removals, refactoring)

### Documentation Overlap Pattern

When completing multiple tasks between commits, the task list markdown is updated by all tasks.
Strategy docs and other shared documentation may also be touched by multiple tasks.

Commit documentation LAST as a separate commit after all code commits:

```text
Commit 1: Task 3.1 code changes only
Commit 2: Task 3.2 code changes only
Commit 3: Task 3.3 code changes only
Commit 4: docs(arc): update task list and strategy doc for Tasks 3.1-3.3
```

This avoids artificial coupling of unrelated code changes and maintains true atomicity.
The documentation commit references all tasks it documents (Tasks X.Y-X.Z format).

### Parent Task Completion

When all subtasks of a parent are complete, mark the parent `[x]` and add this line before
the `Context:` footer in the commit that completes the final subtask:

```text
Completes parent task X.0: [Parent Task Name]
```

## Complex Analysis Path

For accumulated work, multi-session commits, or interleaved changes — follow these steps.

### 1. Check Session Handoff Notes

Read SESSION-NOTES.md for uncommitted work documentation. If the previous session documented
uncommitted work at commit-level granularity (file mappings, task references, commit groupings),
use that as your commit plan rather than reconstructing from scratch.

See [Session Handoff](../session-lifecycle/session-handoff.md) for the format that enables this.

### 2. Identify All Changes

```bash
git status
git --no-pager diff --name-only
```

Examine changes that might not be immediately obvious — config files, documentation, task lists.

### 3. Map Changes to Tasks

- Find relevant task lists in `.arc/active/` (feature/, technical/, incidental/)
- Compare actual changes against task documentation
- Identify which tasks each change belongs to
- Check if completing subtasks makes any parent tasks complete

### 4. Update Task Documentation

- Mark completed subtasks as `[x]` in task files
- Mark parent tasks `[x]` ONLY if ALL subtasks are complete
- Update progress notes and add any discovered tasks
- **Update WORK-STATUS.md** — advance Next Task, Last Completed, and Next Action to
  reflect the post-commit state (see [DEV-RULES.ARC][dev-rules-arc] § Work status accuracy)

### 5. Plan Commit Sequence

Separate changes into atomic commits using the [groupings above](#atomicity-guide).

**When work spans sessions:**

- **Separate commits** for different work contexts (different sessions, tasks, or features)
- **Pragmatic exception:** If changes are truly intermingled in the same file/function,
  commit together but document the overlap in the commit body
- **Don't combine** work from different tasks just because it's easier

### 6. Execute and Verify

Stage and commit each group using the [commit-format][arc-methods-cf] and
[commit-context-format][arc-methods-ccf] methods. After all commits:

```bash
git log --oneline -10    # Review commit messages
git status               # Verify clean state
```

## Branch Practices

- Verify correct branch before committing
- Branch naming: `feature/[name]` for user-facing, `technical/[name]` for infrastructure
- Incidental work: minor fixes commit to the current branch; larger incidental work may use
  a dedicated `incidental/<name>` branch — see [manage-incidental-work.md][manage-incidental]
- Merge using the project's `merge.strategy` setting (default: `merge` — preserves commit history).
  With squash merging, traceability shifts from commits to PR descriptions —
  see [Configurability Architecture][config-arch] § Merge Strategy for implications.
- Clean up branches after successful merge
- See [Work Organization Strategy][work-org] for details

---

[dev-rules-arc]: ../../../../reference/constitution/DEV-RULES.ARC.md
[work-org]: ../../../../reference/strategies/arc/strategy-work-organization.md
[config-arch]: ../../../../reference/strategies/arc/strategy-configurability-architecture.md
[manage-incidental]: manage-incidental-work.md
[arc-ext-pre-stage]: ../../arc-extensions.md#pre-stage-review
[arc-methods]: ../../arc-methods.md
[arc-methods-cf]: ../../arc-methods.md#commit-format
[arc-methods-ccf]: ../../arc-methods.md#commit-context-format
