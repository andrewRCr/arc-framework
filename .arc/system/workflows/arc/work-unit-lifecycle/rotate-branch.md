---
purpose: Intermediate merge — a branch's scope is done but the task list has remaining work to continue.
audience: agent
---

# Workflow: Rotate Branch (Intermediate Merge)

**When to use:** The current branch's tasks are complete, quality gates pass, and more tasks remain in
the task list. You're ready to merge this branch and continue work on the next one.

**When NOT to use:** All tasks in the task list are complete → use [integrate-work-unit][integrate-work-unit]
instead. That workflow handles integration (completion doc, review, PR, merge), followed by
[archive-work-unit][archive-work-unit] for post-merge archival.

---

## Steps

### 1) Verify Branch Readiness

Before initiating rotation:

- [ ] Tasks scoped to this branch are complete (marked `[x]` in task list)
- [ ] Task list overall is **NOT** fully complete (if it is → [integrate-work-unit][integrate-work-unit])
- [ ] Quality gates pass — **Tier 3** (pre-PR gate). See [Quality Gates Strategy][quality-gates]
- [ ] All changes committed to the current branch

### 2) Prepare for Merge

**Update tracking fields:**

- Update `**Branch(es):**` field in the task list header to include the next branch name (if known)

**Create pull request:**

```bash
git push -u origin {current-branch}
gh pr create --base {parent-or-base-branch} --head {current-branch}
```

> **Platform:** Commands in this workflow use GitHub CLI (`gh`). For GitLab, Bitbucket, or other
> platforms, see QUICK-REFERENCE § Platform Commands for equivalent tools and commands.

PR description should summarize the branch's scope, reference the task list, and note that remaining
work continues on the next branch.

**Merge strategy:**

Use regular merge (the default `merge.strategy: merge`) to preserve commit history. This is the
recommended approach for intermediate merges in multi-branch work.

> **If `merge.strategy: squash`:** Squash on an intermediate branch breaks downstream rebases —
> consider regular merge for multi-branch work even when squash is the project default. See
> [Configurability Architecture § Merge Strategy][config-merge].

### 3) Merge and Clean Up

```bash
# Merge via GitHub CLI (regular merge — preserves commit history)
gh pr merge {pr-number} --merge

# Or locally
git switch {parent-or-base-branch}
git merge {current-branch} --no-ff
git push
```

Delete the merged branch:

```bash
git branch -d {current-branch}
git push origin --delete {current-branch}
```

On GitHub, open PRs based on the deleted branch are automatically retargeted to its parent. Other
platforms may require manual retargeting.

### 4) Set Up Next Branch

**If creating a new branch** (most common — stacked PRs, phased delivery):

```bash
git switch {parent-or-base-branch}
git pull origin {parent-or-base-branch}
git switch -c {next-branch}
```

**If an existing downstream branch needs rebasing** (team sub-branches, pre-created stacks):

```bash
git switch {downstream-branch}
git rebase {parent-or-base-branch}
git push --force-with-lease origin {downstream-branch}
```

Use `--force-with-lease` (not `--force`) — it refuses the push if the remote branch has changed since
your last fetch, preventing accidental overwrites of collaborators' work.

### 5) Update Tracking

- [ ] Task list `**Branch(es):**` field includes the new branch name (if not updated in step 2)
- [ ] Status file (`active/{category}/status-{name}.md`) `**Branch:**` updated to the new branch
      name; `**Next Task:**` and `**Next Action:**` advanced to the first task on the new branch
- [ ] Task list file and status file are present and accessible on the new branch (both travel
      across rotations via normal merge flow)
- [ ] Current task is identifiable — next unchecked item in the task list

If the session is ending after rotation, run [session-handoff][session-handoff] to preserve context
for the next session.

---

[integrate-work-unit]: integrate-work-unit.md
[archive-work-unit]: archive-work-unit.md
[session-handoff]: ../session-lifecycle/session-handoff.md
[quality-gates]: ../../../../reference/strategies/arc/strategy-quality-gates.md
[config-merge]: ../../../../reference/strategies/arc/strategy-configurability-architecture.md
