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

> **Interrupted parent WU:** If the WU being deactivated is interrupting another WU (per
> [`manage-incidental-work.md`][incidental]), deactivation must also resume the paused parent — see
> [`manage-incidental-work.md`][incidental] for the paired protocol.

---

## Case Matrix

|                        | No task work executed                       | Some task work executed           |
| ---------------------- | ------------------------------------------- | --------------------------------- |
| **Not merged to base** | **Case A** — this workflow (or A-delete)    | **Case B** → `arc-shift` (future) |
| **Merged to base**     | **Case C** — noted edge case below          | **Case D** → integrate or clean   |

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

### 2) State-flip + Branch field edit

Edit `.arc/active/meta-{name}.md`:

- `**State:** Active` → `**State:** Planning`
- `**Branch:** {type}/{name}` → `**Branch:** plan/{name}`

Stage both edits.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
chore(arc): deactivate {work-name} work unit

- Flip State: Active → Planning
- Branch field: {type}/{name} → plan/{name}

Context: meta-{name}.md (deactivation)
```

### 3) Branch rename · 3-step routing

Inverse of activation:

- **Extensions** · `#pre-push-review`: If `pre-push-review` appears in the active-extensions list
  (established at session init), load and execute its `.actions` before the `workflowPush` push.
  Halt-on-fail surfaces an actionable message; user fix-and-retries or explicit-invoke bypasses.
  Otherwise, skip.

```bash
git branch -m {type}/{name} plan/{name}    # local rename (raw)
git push -u origin plan/{name}              # workflowPush
git push origin --delete {type}/{name}      # raw — destructive flag stays literal
```

`<type>` per [`branch-format`][branch-format]. The wrapper refuses `--delete` by design, so the old-remote deletion
stays as raw `git`.

---

## Steps (Case A-delete — abandon entirely)

### 1) Close any open PR

```bash
gh pr close {pr-number} --comment "Deactivating work unit; abandoning. No task work executed."
```

See QUICK-REFERENCE § Platform Commands for non-GitHub equivalents.

### 2) Switch to base branch

```bash
git switch {base-branch}
```

### 3) Delete the branch

```bash
git branch -D {type}/{name}                 # local
git push origin --delete {type}/{name}      # remote (if pushed)
```

`-D` (force) is required — the activation commit on the branch never merged to base. That's expected.

### 4) Clean up base-branch leftovers (per `pm.mode`)

Branch deletion in Step 3 removed the WU's in-flight artifacts (`active/meta-*`, `active/prd-*`, `active/tasks-*`,
`active/atomic-*`, `active/notes-*`, any residual `active/plan-*`) — they lived only on the deleted branch and
were never merged. The remaining cleanup concerns base-branch leftovers that activation never touched:

- **`arc-in-git`:** If the WU originated from a backlog stub, `backlog/{state}/{name}/` may still exist on base
  (init moved its plan-doc + companions onto the WU branch but the source folder isn't removed on base until
  merge). Remove if present. ROADMAP may also need regen to drop the abandoned WU's tier entry — see
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

## Next Step

Deactivation has no session-level next action. The developer decides what follows — resume another WU, return to
`1_create-prd.md` on the now-planning branch (Case A), or start something new.

---

[activate]: activate-work-unit.md
[branch-format]: ../../../methods/branch-format.md
[incidental]: ../supplemental/manage-incidental-work.md
[work-org-roadmap]: ../../../../reference/strategies/arc/strategy-work-organization.md#roadmap
