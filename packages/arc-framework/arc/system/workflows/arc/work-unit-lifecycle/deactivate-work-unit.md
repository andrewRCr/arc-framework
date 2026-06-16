---
purpose: Reverse a work unit activation when no task work has executed — state-flip + branch rename, or full deletion.
audience: collaborative (human and agent)
arc:
  methods:
    - branch-format
  extensions:
    - pre-push-review
---

# Workflow: Deactivate Work Unit

Reverses an activation when no task work has executed and nothing has merged. Two variants: return the WU to Planning
(inverse of [`activate-work-unit.md`][activate]), or abandon it entirely (branch and artifacts removed).

**When to use:** A WU was activated, but circumstances changed before any task execution — priorities shifted, the
design needs rework, the feature was cancelled. The activation itself is the only thing to undo.

---

## Case Matrix

|                        | No task work executed                       | Some task work executed           |
| ---------------------- | ------------------------------------------- | --------------------------------- |
| **Not merged to base** | **Case A** — this workflow (or A-delete)    | **Case B** — see § Case B below   |
| **Merged to base**     | **Case C** — see § Case C below             | **Case D** → integrate or clean   |

**Case A** has two variants — the user chooses; surface the variant decision when invoking the workflow:

- **A (default)** — return the WU to Planning (state flip + branch rename, inverse of activation)
- **A-delete** — abandon the WU entirely (branch and artifacts removed)

## Prerequisites (Case A / A-delete)

- Currently on the WU's `<type>/<name>` branch (per [`branch-format`][branch-format])
- `.arc/active/meta-{name}.md` exists and shows `**State:** Active`
- Task list checkboxes all `[ ]` (no task work executed)
- No commits from this WU have merged to the base branch (PRs closed without merge, or never opened)
- Developer has write access to the remote if the branch was pushed

> **Team mode:** Branch operations are cross-developer. Confirm with collaborators before renaming or deleting a
> shared branch — if anyone has local commits, coordinate their handling before proceeding.

---

## Steps (Case A — return to Planning)

### 1) Close any open PR

If a PR was opened for `<type>/<name>`, close it without merging — note the deactivation in the closure comment
to leave a search trail.

```bash
gh pr close {pr-number} --comment "Deactivating work unit; returning to Planning. No task work executed."
```

See QUICK-REFERENCE § Platform Commands for non-GitHub equivalents.

### 2) Run the `deactivate` transition

```bash
arc deactivate {name}
```

The executor fires the `deactivate` edge: flips `**State:** Active → Planning`, rotates
`**Branch:** {type}/{name} → plan/{name}` **and** renames the local branch back, and clears the `**Next Task:**` /
`**Next Action:**` set at activation. `{name}` defaults to the current worktree's WU.

Stage the edits.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): deactivate {work-name} work unit

- Flip State: Active → Planning
- Rotate branch: {type}/{name} → plan/{name}
- Clear Next Task / Next Action

Context: meta-{name}.md (deactivation)
```

### 3) Push the rotated branch · 2-step routing

The local branch rename back landed in Step 2 (executor-owned); only the remote legs remain.

- **Extensions** · `#pre-push-review`: If `pre-push-review` appears in the active-extensions list
  (established at session init), load and execute its `.actions` before the `workflowPush` push.
  Halt-on-fail surfaces an actionable message; user fix-and-retries or explicit-invoke bypasses.
  Otherwise, skip.

```bash
git push -u origin plan/{name}              # workflowPush
git push origin --delete {type}/{name}      # raw — destructive flag stays literal
```

The wrapper refuses `--delete` by design, so the old-remote deletion stays as raw `git`.

---

## Steps (Case A-delete — abandon entirely)

### 1) Close any open PR

```bash
gh pr close {pr-number} --comment "Deactivating work unit; abandoning. No task work executed."
```

See QUICK-REFERENCE § Platform Commands for non-GitHub equivalents.

### 2) Branch + worktree teardown · dispatched by worktree identity

Dispatch by the current worktree's identity:

**Primary worktree (in-place WU):** no distinct worktree exists. Switch to base and force-delete the branch:

```bash
git switch {base-branch}
git branch -D {type}/{name}                 # local (force — unmerged is expected for abandonment)
git push origin --delete {type}/{name}      # remote (if pushed)
```

`-D` (force) is required — the activation commit never merged to base. That's expected.

**Linked worktree (spawned WU):** navigate to another worktree (typically main):

```bash
cd <main-worktree-path>
```

Consult `decideWorktreeCleanup` against the abandoned WU's worktree with abandonment context. Abandonment
authorizes removal of unmerged work — the merge gate is bypassed; marker + clean resolves to `removable`.

- **`removable`** — auto-remove the WU worktree:

    ```bash
    git worktree remove <wu-worktree-path>
    ```

- **`blocked`** (marker + dirty) or **`external`** (no ARC marker) — surface the state; do not auto-remove.
  The operator's tool handles externally-spawned worktree removal; manually clean up a `blocked` worktree
  before re-invoking if its state matters.

Then force-delete the branch from main:

```bash
git branch -D {type}/{name}                 # local (force — unmerged is expected)
git push origin --delete {type}/{name}      # remote (if pushed)
```

The agent's prior cwd no longer exists if it was in the WU worktree (on the `removable` arm).

### 3) Clean up base-branch leftovers (per `pm.mode`)

Branch deletion in Step 2 removed the WU's in-flight artifacts (`active/meta-*`, `active/spec-*`, `active/tasks-*`,
`active/notes-*`, any residual `active/draft-*`) — they lived only on the deleted branch and
were never merged. The remaining cleanup concerns base-branch leftovers that activation never touched:

- **`arc-in-git`:** If the WU originated from a backlog stub, `backlog/{state}/{name}/` may still exist on base
  (init moved its draft-doc + companions onto the WU branch but the source folder isn't removed on base until
  merge). Remove if present. ROADMAP may also need a re-render to drop the abandoned WU — see
  [Work Organization Strategy § ROADMAP][work-org-roadmap].
- **`external`:** Update the external tracker — move the work item back to its pre-activation state or to an
  abandoned bucket. No local file cleanup needed.
- **`none`:** No file cleanup needed.

If a commit is required for the cleanup (arc-in-git with backlog/ROADMAP edits), full protection wants its own
branch — `git checkout -b chore/deactivate-{name}` — pushed (`workflowPush`) and merged via PR. Under partial
protection, the commit lands directly on base.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): abandon {work-name} work unit

Context: meta-{name}.md (deactivation)
```

---

## Case B — some task work executed, not merged

Task work has run but nothing has merged to base, so the activation is no longer the only thing to undo —
committed work exists and its fate is the operator's call. A WU in `**State:** Integrating` (PR open, awaiting
review) is the live form of this case — deactivate does not rotate an `Integrating` meta; finish through
[`integrate-work-unit.md`][integrate] or close the PR first. This workflow does not automate Case B; it names the
three paths and routes each to the workflow that owns it.

- **Integrate the partial scope.** The work done so far stands on its own and is worth shipping. Run
  [`integrate-work-unit.md`][integrate] from the WU branch; the completed scope merges through the normal PR
  path. Drop any unstarted scope from the task list (mark those tasks `[~]` with a note) or carry it into a
  follow-up WU.
- **Abandon with history loss.** The work is not worth keeping. This is Case A-delete with committed work
  present — branch deletion leaves those commits reachable only via reflog (garbage-collected over time), not
  recoverable from base. Surface the irreversibility, get explicit operator authorization, then run the Case
  A-delete teardown above.
- **Move the work to a successor.** The direction changed but the committed work seeds a new approach.
  Cherry-pick the relevant commits onto the successor WU's branch — the successor's meta records the
  continuation through its `**Origin:**` — then run the Case A-delete teardown above on the original.

Case B is operator-driven throughout: no state flip, and no automated branch handling beyond whichever terminal
path (integrate or Case A-delete) the operator selects.

---

## Case C — merged to base, no task work executed

Rare. The activation reached base — its meta-file edits merged (e.g. as a direct commit under partial
protection) — but no task work has run, so the activation is the only thing to undo, and it can't be reversed
locally since it lives on base. No dedicated workflow ships for this; reverse it with a deactivation PR:

1. Branch from base.
2. Reverse the activation's meta-file edits — the inverse of [`activate-work-unit.md`][activate] Step 4:
   `**State:** Active → Planning`, `**Branch:**` back to `plan/{name}`, and the Next Action back to a planning
   pointer.
3. Open the PR, note the deactivation in its description, and merge once approved. If the activation also renamed
   the live branch, rename it back per the Case A branch-rename routing above.

---

## Next Step

Deactivation has no session-level next action. The developer decides what follows — resume another WU, return to
`create-spec.md` on the now-planning branch (Case A), or start something new.

---

[activate]: activate-work-unit.md
[integrate]: integrate-work-unit.md
[branch-format]: ../../../methods/branch-format.md
[work-org-roadmap]: ../../../../reference/strategies/arc/strategy-work-organization.md#roadmap
