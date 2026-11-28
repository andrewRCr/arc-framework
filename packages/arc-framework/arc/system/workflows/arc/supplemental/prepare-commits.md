---
purpose: Guide for commit scenarios that need more than staging and committing.
audience: agent
arc:
  methods:
    - commit-format
    - commit-footer
---

# Workflow: Prepare Commits

This is the complex-path body for the [arc-commit skill][arc-commit-skill]. The skill owns the
simple-vs-complex path decision; if you're reading this workflow directly, you've already been
routed to the complex path.

## When This Workflow Applies

- Multiple tasks accumulated without committing
- Uncommitted work spanning multiple sessions
- Interleaved changes across tasks that need separating
- Uncertainty about what should be one commit vs. multiple
- Session-end commits with mixed completed and partial work

For straightforward commits (single task, clear scope), arc-commit's simple path plus
[commit-format][arc-methods-cf] / [commit-footer][arc-methods-ccf] (loaded via this
workflow's frontmatter) plus git hook validation are sufficient.

## Atomicity Guide

**One logical change per commit.** When deciding how to split accumulated work, group by concern:

1. Core functionality (new features, major logic)
2. Configuration/infrastructure (settings, configs)
3. Tests (test files, test configurations)
4. Documentation (strategy docs, READMEs)
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
- **Does NOT apply** to task list or meta updates. These are ARC state, saved with `arc save` and
  never committed — see § Granularity guidance.

### Parent Task Completion

The close that completes a parent's last subtask closes the parent too. In the commit that
completes the final subtask, add this line before the `Context:` footer:

```text
Completes parent task X.0: [Parent Task Name]
```

## Complex Analysis Path

For accumulated work, multi-session commits, or interleaved changes — follow these steps.

### 1. Check the Session Context

Read the meta's session context (`arc view meta`) for its Uncommitted Work section. If the previous
session documented uncommitted work at commit-level granularity (file mappings, task references,
commit groupings), use that as your commit plan rather than reconstructing from scratch.

See [Session Handoff](../session-lifecycle/session-handoff.md) for the format that enables this.

### 2. Identify All Changes

```bash
git status
git --no-pager diff --name-only
```

Examine changes that might not be immediately obvious — config files and documentation. The task
list and other ARC state never stage; `arc selection --changed` lists the state edited since the
last save.

### 3. Map Changes to Tasks

- Read the active task list (`arc view tasks`)
- Compare actual changes against task documentation
- Identify which tasks each change belongs to
- Check if completing subtasks makes any parent tasks complete

### 4. Update Task Documentation

- Write each completed task's completion note and add any discovered tasks
- Close no task by hand: each closes with the commit that carries its work (step 6)

The meta is **not** updated here — see [DEV-RULES.ARC][dev-rules-arc] § Commit Discipline.

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
- **Tasks close after their work lands.** Once all of a task's commits have landed, close it by ID using step 6's
  capture rules.
- **ARC state rides with no commit.** The task list, the meta, and the other ARC records persist
  with `arc save`; commits carry tracked files only.

### 6. Execute and Verify

Stage and commit each group using the [commit-format][arc-methods-cf] and [commit-footer][arc-methods-ccf]
methods. Use default capture only when its outstanding commits are exactly the commits owed to every task being
closed. In that case, use `arc release commit --close=<ids>` where the commit routes to the wrapper, or run
`arc task close <ids>` right after a raw commit.

For mixed ownership, retain the mapping from step 3 and record the SHAs as the commits land. Include a shared
documentation commit in the mapping for each task it serves. Commit without `--close`. Once all commits for a task
have landed, run `arc task close <id> --commit <sha>`, repeating `--commit <sha>` for each commit mapped to it.

After all commits, save the state the tasks' completion notes changed:

```bash
arc save
git log --oneline -10    # Review commit messages
git status               # Verify clean state
```

**Verify correct branch before committing.** Branch model — naming, incidental routing, merge
strategy — lives in [Work Organization Strategy][work-org].

---

[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md
[work-org]: ../../../../reference/strategies/arc/strategy-work-organization.md
[arc-commit-skill]: ../../../.internal/skills/arc-commit/SKILL.md
[arc-methods-cf]: ../../../methods/commit-format.md
[arc-methods-ccf]: ../../../methods/commit-footer.md
