---
purpose: Guide for commit scenarios that need more than staging and committing.
audience: agent
arc:
  methods:
    - commit-format
    - commit-footer
  extensions:
    - pre-stage-review
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
- **Does NOT apply** to task list updates. These are derived state that rides with the content
  commit that triggered them — see § Granularity guidance.
- **Does NOT apply** to status-file updates. These fire only at handoff or workflow-ceremony
  boundaries; the exact commit shape (dedicated `chore(status):` vs. bundled with concurrent
  ceremony content) follows [DEV-RULES.ARC][dev-rules-arc] § Status-file timing and § Status-file
  commit shape.

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

The active status file is **not** updated here — see [DEV-RULES.ARC][dev-rules-arc]
§ Status-file timing.

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
- **Task list checkboxes ride with content commits.** They are derived state that belongs with
  the commit that produced the content change — not a separate meta-commit and not hunk-split to
  keep 1:1 task-ID-to-checkbox granularity.
- **Status-file updates do not ride with code commits.** They fire only at handoff or
  workflow-ceremony boundaries; shape (dedicated vs bundled with concurrent ceremony content)
  follows [DEV-RULES.ARC][dev-rules-arc] § Status-file timing and § Status-file commit shape.

### 6. Execute and Verify

Stage and commit each group using the [commit-format][arc-methods-cf] and
[commit-footer][arc-methods-ccf] methods. After all commits:

```bash
git log --oneline -10    # Review commit messages
git status               # Verify clean state
```

**Verify correct branch before committing.** Branch model — naming, incidental routing, merge
strategy — lives in [Work Organization Strategy][work-org].

---

[dev-rules-arc]: ../../../../reference/constitution/DEV-RULES.ARC.md
[work-org]: ../../../../reference/strategies/arc/strategy-work-organization.md
[arc-commit-skill]: ../../../skills/arc-commit/SKILL.md
[arc-methods-cf]: ../../../methods/commit-format.md
[arc-methods-ccf]: ../../../methods/commit-footer.md
