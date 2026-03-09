# Workflow: Rotate Branch (Intermediate Merge)

**Audience:** Agent-executed — your agent follows this when merging a branch mid-work-unit.

Multi-branch work units go through three operations: **Rotate → Integrate → Archive**. This workflow covers
Rotate — the intermediate merge. A branch's scope of work is done, but the overall task list has more work
remaining on a subsequent branch.

**When to use:** The current branch's tasks are complete, quality gates pass, and more tasks remain in
the task list. You're ready to merge this branch and continue work on the next one.

**When NOT to use:** All tasks in the task list are complete → use [integrate-work-unit][integrate-work-unit]
instead. That workflow handles integration (completion doc, review, PR, merge), followed by
[archive-work-unit][archive-work-unit] for post-merge archival.

## Scenarios

This workflow applies to any multi-branch pattern:

- **Stacked PRs** — A large task list split across 2-3 branches for smaller, reviewable pull requests
- **Phased delivery** — Sequential branches delivering different phases of the same task list to the base branch
- **Team sub-branches** — A developer merging their personal branch into a shared integration branch

See [Work Organization Strategy § Task Lists and Branches][work-org-branches] for the complete
many-to-one relationship model.

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

> **If `merge.strategy: squash`:** Squash-merging an intermediate branch collapses its commits into a
> single commit on the base. Any downstream branches that still reference the original commits will face
> conflict-heavy rebases — Git cannot reconcile the squashed commit with the originals. For multi-branch
> work, consider using regular merge for intermediate PRs even when squash is the project default, or
> plan for the manual rebase cost on downstream branches. See [Configurability Architecture §
> Merge Strategy][config-merge] for behavioral implications of each strategy.

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
- [ ] WORK-STATUS.md updated to reflect the new branch and current task
- [ ] Task list file is present and accessible on the new branch
- [ ] Current task is identifiable — next unchecked item in the task list

If the session is ending after rotation, run [session-handoff][session-handoff] to preserve context
for the next session.

---

## Common Pitfalls

- **Squash-merging intermediate branches** — Breaks downstream branch rebases. See merge strategy
  note in step 2.
- **Archiving too early** — Rotation is not archival. Archive only when **all** tasks in the task list
  are complete. See [integrate-work-unit][integrate-work-unit].
- **Forgetting `Branch(es)` field update** — Stale tracking makes session initialization harder for
  the next session or collaborator.
- **Not rebasing downstream branches** — After merging to the base branch, existing downstream branches
  still reference old commits. Rebase them onto the updated base to avoid orphaned history.

---

[integrate-work-unit]: integrate-work-unit.md
[archive-work-unit]: archive-work-unit.md
[session-handoff]: ../session-lifecycle/session-handoff.md
[work-org-branches]: ../../../../reference/strategies/arc/strategy-work-organization.md#5-task-lists-and-branches
[quality-gates]: ../../../../reference/strategies/arc/strategy-quality-gates.md
[config-merge]: ../../../../reference/strategies/arc/strategy-configurability-architecture.md
