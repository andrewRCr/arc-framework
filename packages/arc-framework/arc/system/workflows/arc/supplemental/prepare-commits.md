---
purpose: Guide for commit scenarios that need more than staging and committing.
audience: agent
arc:
  methods:
    - commit-format
    - commit-context-format
  extensions:
    - pre-stage-review
---

# Workflow: Prepare Commits

For straightforward commits (single task, clear scope), the [commit-format][arc-methods-cf] and
[commit-context-format][arc-methods-ccf] methods plus git hook validation are sufficient — you don't
need this guide.

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
3. Update task list and the active status file if committing completed task work (see
   [DEV-RULES.ARC][dev-rules-arc] § Work status accuracy) — stage with the commit
4. Stage files for one logical change
5. Pre-stage review extensions · `#pre-stage-review`: If `pre-stage-review` appears in the active-extensions
   list (established at session init), load and execute its [`.actions`][arc-ext-pre-stage]. Otherwise, skip.
6. Verify staging: `git diff --cached --stat` — confirm the staged set matches intent. Pre-staged
   files (from earlier `git rm` or `git add`) can silently slip in; intended files can be left out.
7. Commit using the [commit-format][arc-methods-cf] and [commit-context-format][arc-methods-ccf] methods
8. Git hooks validate automatically

## Atomicity Guide

**One logical change per commit.** When deciding how to split accumulated work, group by concern:

1. Core functionality (new features, major logic)
2. Configuration/infrastructure (settings, configs)
3. Tests (test files, test configurations)
4. Documentation (task list updates, strategy docs)
5. Code formatting (linting fixes, style)
6. Dependencies (package manifests, lock files)
7. Cleanup (removals, refactoring)

### Shared-Docs Commit Pattern

When multiple **independent** code tasks all edit one shared documentation file, defer shared-doc
updates to a final `docs(...): update [doc] for Tasks X.Y-X.Z` commit after the code commits.

**Narrow application:**

- **Applies** when multiple independent code tasks each justify edits to one shared doc that
  would otherwise tangle across the code commits.
- **Does NOT apply** to pure-docs WUs where the docs ARE the work (audits, restructures, writing
  sweeps). Commit groupings follow § Granularity guidance below.
- **Does NOT apply** to task list or active status file updates. These are derived state that
  rides with the content commit that triggered them — see § Granularity guidance and
  [DEV-RULES.ARC][dev-rules-arc] § Work status accuracy.

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
- **Update the active status file** — advance Next Task, Last Completed, and Next Action to
  reflect the post-commit state (see [DEV-RULES.ARC][dev-rules-arc] § Work status accuracy)

### 5. Plan Commit Sequence

Separate changes into commits using the [groupings above](#atomicity-guide) and the granularity
guidance below.

**Granularity guidance:**

- **One problem solved per commit — scope, not volume, as the sizing metric.**
- **Split when the description needs multiple sentences explaining different problems.**
- **Reversibility as the guard.** If reverting one change would force reverting others, they
  belong together. If they fail or succeed independently, they split.
- **Pragmatic exception for intermingled code:** Changes tangled in the same file/function
  commit together; note the overlap in the body.
- **Tracking docs ride with content commits.** Task list checkboxes and active status file
  updates are derived state — they belong with the commit that produced the content change, not
  a separate meta-commit.

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
[arc-ext-pre-stage]: ../../../extensions/pre-stage-review.md
[arc-methods-cf]: ../../../methods/commit-format.md
[arc-methods-ccf]: ../../../methods/commit-context-format.md
