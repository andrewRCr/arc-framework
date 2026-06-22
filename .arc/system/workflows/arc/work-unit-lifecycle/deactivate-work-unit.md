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

### 2) Run the `abandon` transition

Run this from the WU's own checkout — the **primary** worktree on the WU branch for an in-place WU, or the WU's
**linked** worktree.

```bash
arc abandon {name} --yes
```

The destructive cascade **stages** the removal of the WU's artifact set, closes the user session workspace, and
regenerates `STATUS.USER`, emitting a ROADMAP hand-render advisory. `--yes` confirms the cascade — `arc abandon`
prints the impact plan and refuses without it; the slug is required (`abandon` never defaults to the current WU).

The branch and worktree are **not** torn down here — that physical reap is the out-of-band `arc teardown --force`
in Step 4. (Firing the teardown in-verb tripped the clean guard on the verb's own staged removal and, in-place,
targeted the un-removable primary worktree.) `arc abandon` stages but does not commit.

### 3) Commit the abandonment

`arc teardown` reaps from a **clean** worktree (it refuses a dirty tree and never force-removes uncommitted
work), so the staged removal is committed first. The commit lands on the WU branch and is never merged — the
branch is reaped in Step 4 — so it records the abandonment and clears the tree for the teardown.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): abandon {work-name} work unit

- Remove the work unit's artifact set
- Close the user session workspace

Context: meta-{name}.md (deactivation)
```

### 4) Tear down the branch + worktree

```bash
arc teardown {name} --force
```

`--force` selects the un-shipped teardown mode: the WU is not in `completed/` and its branch is unmerged, so the
conservation safety is the committed abandonment above, not git-containment. It force-deletes the branch (local
**and** the remote ref) and reaps the worktree — the in-place arm switches the primary worktree to the base
branch before the delete; a linked arm removes the worktree and locus-hops. The agent's prior cwd no longer
exists if it was in a torn-down WU worktree.

### 5) Clean up base-branch leftovers (per `pm.mode`)

Steps 2–4 removed the WU's in-flight artifacts (`active/meta-*`, `active/spec-*`, `active/tasks-*`,
`active/notes-*`, any residual `active/draft-*`) along with its branch and worktree — they lived only on the
reaped branch and were never merged. The remaining cleanup concerns base-branch leftovers those steps don't
reach:

- **`arc-in-git`:** If the WU originated from a backlog stub, `backlog/{state}/{name}/` may still exist on base
  (init moved its draft-doc + companions onto the WU branch but the source folder isn't removed on base until
  merge). Remove if present, then hand-render ROADMAP to drop the abandoned WU (the re-render Step 2's advisory
  flagged, now also reflecting the removed backlog row) — see [Work Organization Strategy § ROADMAP][work-org-roadmap].
- **`external`:** Update the external tracker — move the work item back to its pre-activation state or to an
  abandoned bucket. No local file cleanup needed.
- **`none`:** No file cleanup needed.

This base cleanup is a separate commit, made from the base checkout (Step 4 left the primary on the base branch).
Under full protection it wants its own branch — `git checkout -b chore/deactivate-{name}` — pushed
(`workflowPush`) and merged via PR. Under partial protection, the commit lands directly on base.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): clean up abandoned {work-name} backlog leftovers

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
