---
purpose: Reverse a work unit activation when no task work has executed — a state flip keeping the branch, or deletion.
audience: collaborative (human and agent)
---

# Workflow: Deactivate Work Unit

Reverses an activation when no task work has executed and nothing has merged. Two variants: return the WU to Planning
(inverse of [`activate-work-unit.md`][activate]), or abandon it entirely (its records removed, its branch reaped).

**When to use:** A WU was activated, but circumstances changed before any task execution — priorities shifted, the
design needs rework, the feature was cancelled. The activation itself is the only thing to undo.

---

## Case Matrix

|                        | No task work executed                    | Some task work executed         |
| ---------------------- | ---------------------------------------- | ------------------------------- |
| **Not merged to base** | **Case A** — this workflow (or A-delete) | **Case B** — see § Case B below |
| **Merged to base**     | **Case C** — see § Case C below          | **Case D** → integrate or clean |

**Case A** has two variants — the user chooses; surface the variant decision when invoking the workflow:

- **A (default)** — return the WU to Planning (state flip keeping the work branch, inverse of activation)
- **A-delete** — abandon the WU entirely (its records removed, its checkout and created branch reaped)

## Prerequisites (Case A / A-delete)

- In the checkout `arc locus` resolves to the WU, on its linked work branch
- `arc view meta` shows `**State:** Active`
- Task list checkboxes all `[ ]` (no task work executed)
- No commits from this WU have merged to the base branch (PRs closed without merge, or never opened)
- Developer has write access to the remote if the branch was pushed

> **Team mode:** Branch operations are cross-developer. Confirm with collaborators before deleting a shared branch —
> if anyone has local commits, coordinate their handling before proceeding.

---

## Steps (Case A — return to Planning)

### 1) Close any open PR

If a PR was opened for the linked work branch, close it without merging — note the deactivation in the closure comment
to leave a search trail.

```bash
gh pr close {pr-number} --comment "Deactivating work unit; returning to Planning. No task work executed."
```

See QUICK-REFERENCE § Platform Commands for non-GitHub equivalents.

### 2) Run the `deactivate` transition

```bash
arc deactivate {name}
```

The verb flips `**State:** Active → Planning`, returns `**Current Workflow:**` to the planning stage `Design` names,
and clears the `**Next Action:**` set at activation, in one write. It keeps the work branch as the WU's branch link,
with this checkout on it, so a later activation reattaches it rather than cutting another; nothing is pushed or
deleted. Its report lists the task work a re-activation would record as excluded, naming `arc task close`, as a pause
reports unshared work. `{name}` defaults to the current checkout's WU.

---

## Steps (Case A-delete — abandon entirely)

### 1) Withdraw or close the PR

If the source is `Integrating` (Case B), follow the withdrawal in [`reopen-work-unit`][reopen] from the source's own
checkout, in the default close mode. When the source is Active and its PR is closed, go directly to Step 2.

For an Active source with an open PR, close it before abandoning:

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

The verb ends the WU in one write, removing its records and recording the abandonment with the branch links it held,
then removes this checkout, or releases an anchored one, and reaps the work branch ARC created, local and remote, with
no merge check. `--yes` confirms the cascade — `arc abandon` prints the impact plan and refuses without it; the slug is
required (`abandon` never defaults to the current WU). When the checkout's removal or the branch's reap fails after the
write, run the exact `arc teardown <UID>` continuation printed by `arc abandon`. Keep that UID for retries, including
across sessions. The agent's prior cwd no longer exists if it was in a removed WU worktree.

### 3) Clean up outside ARC (per `pm.mode`)

- **`external`:** Update the external tracker — move the work item back to its pre-activation state or to an
  abandoned bucket.
- **`arc-in-git` / `none`:** No cleanup remains.

---

## Case B — some task work executed, not merged

Task work has run but nothing has merged to base, so the activation is no longer the only thing to undo —
committed work exists and its fate is the operator's call. A WU in `**State:** Integrating` (PR open, awaiting
review) is the live form of this case. The operator chooses one of the following paths.

- **Integrate the partial scope.** The work done so far stands on its own and is worth shipping. Run
  [`integrate-work-unit.md`][integrate] from the WU branch; the completed scope merges through the normal PR
  path. Drop any unstarted scope from the task list (defer those tasks with `arc task defer <id>` and a note) or carry
  it into a follow-up WU.
- **Abandon with history loss.** The work is not worth keeping. This is Case A-delete with committed work
  present — branch deletion leaves those commits reachable only via reflog (garbage-collected over time), not
  recoverable from base. Surface the irreversibility, get explicit operator authorization, then run the Case
  A-delete abandon above.
- **Move the work to a successor.** The direction changed but the committed work seeds a new approach.
  Cherry-pick the relevant commits onto the successor WU's branch — the successor's meta records the
  continuation through its `**Origin:**` — then run the Case A-delete abandon above on the original.

---

## Case C — merged to base, no task work executed

Rare. The work branch's commits reached base, though no task work has run. The activation is a record write rather
than a merged change, so the same verb reverses it wherever the branch stands: run Case A's steps. No deactivation PR
is needed.

---

## Next Step

Deactivation has no session-level next action. The developer decides what follows — resume another WU, return to
planning in the same checkout at the stage `**Current Workflow:**` names (Case A), or start something new.

---

[activate]: activate-work-unit.md
[integrate]: integrate-work-unit.md
[reopen]: reopen-work-unit.md
