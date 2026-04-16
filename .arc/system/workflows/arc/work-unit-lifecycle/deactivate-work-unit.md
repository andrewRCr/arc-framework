# Workflow: Deactivate Work Unit

**Audience:** Collaborative — developer and agent revert the activation of a work unit that never
meaningfully started.

## Purpose

Revert a work unit activation when no task work has been executed and nothing has merged to the base
branch. Returns the project to its pre-activation state: implementation branch gone, planning
artifacts back in their pre-activation location, no status file.

> **Design principle:** _Deactivation means undo-activation of a work unit that didn't meaningfully
> start._ If work has happened, the correct operation is pause (`arc-shift`, future), completion
> ([`integrate-work-unit.md`][integrate]), or abandonment ([`clean-work-unit.md`][clean]) — not
> deactivation.

**When to use:** A WU was activated, but circumstances changed before any task execution — priorities
shifted, the design needs rework, the feature was cancelled. The activation itself is the only thing
to undo.

> **Incidental WU that interrupted a parent:** If the WU being deactivated was activated via the
> coordinated pause pattern in [`manage-incidental-work.md`][incidental], deactivation must also
> resume the paused parent — see [`manage-incidental-work.md`][incidental] § Coordinated Pause/Resume
> for the paired protocol.

## Case Matrix

|                        | No task work executed        | Some task work executed           |
| ---------------------- | ---------------------------- | --------------------------------- |
| **Not merged to main** | **Case A** — this workflow   | **Case B** → `arc-shift` (future) |
| **Merged to main**     | **Case C** — noted edge case | **Case D** → integrate or clean   |

Only Case A is genuine deactivation — the implementation branch is the entire surface area of the
activation, so deleting it undoes the activation by construction. The other three have work or merged
state that moves them out of deactivation semantics into pause, integration, or archival lifecycles.

## Prerequisites (Case A)

- No task work executed on the implementation branch (task list checkboxes all `[ ]`)
- No commits from this WU have merged to the base branch (PRs closed without merge, or never opened)
- Developer has write access to the remote if the branch was pushed

> **Team mode:** Branch deletion is cross-developer by design. Confirm with collaborators before
> deleting a shared branch — if anyone has local commits, coordinate their handling before
> proceeding.

## Mode Detection

Reversion semantics differ by [`arc-config.yml`][arc-config] → `pm.mode`:

- **arc-in-git**: Activation moved PRD / task list / atomic companion from `backlog/` to `active/`
  on the branch ([`activate-work-unit.md`][activate] Step 3). Branch deletion reverts those moves
  automatically — main still shows the artifacts in `backlog/`. Apply Step 4.
- **external**: Local `active/` artifacts are agent-facing scaffold; the external tracker holds the
  source of truth. Apply Step 5.
- **none**: Local `active/` artifacts are the only copies. Apply Step 6.

## Steps (Case A)

### Step 1: Close Any Open PR

If a pull request was opened for the implementation branch, close it without merging. Note the
deactivation in the closure comment — this leaves a search trail for anyone later wondering why
the branch disappeared.

```bash
# GitHub example — adjust for your platform (see QUICK-REFERENCE for alternatives)
gh pr close {pr-number} --comment "Deactivating work unit; no task work executed."
```

### Step 2: Switch to Base Branch

```bash
git checkout main
```

### Step 3: Delete the Implementation Branch

**Local:**

```bash
git branch -D {feature|technical}/{branch-name}
```

Use `-D` (force) — the branch carries the activation commit that was never merged to main. That's
expected for Case A.

**Remote (if pushed):**

```bash
git push origin --delete {feature|technical}/{branch-name}
```

### Step 4: Verify Pre-Activation State · `arc-in-git` only

> **Skip this step** if `pm.mode` is `external` or `none`.

Branch deletion reverted the `git mv` from `backlog/` to `active/` and discarded the activation
commit's status file creation and PROJECT-STATUS / ROADMAP updates. Main should now match
pre-activation state. Verify:

```bash
ls .arc/backlog/{category}/prd-{name}.md \
   .arc/backlog/{category}/tasks-{name}.md \
   .arc/backlog/{category}/atomic-{name}.md
# Expected: all three present

ls .arc/active/{category}/status-{name}.md 2>/dev/null
# Expected: no such file or directory
```

No further action required — the WU is back in planning state.

### Step 5: Clean Up Local Artifacts · `external` only

> **Skip this step** if `pm.mode` is `arc-in-git` or `none`.

Local `active/` artifacts persist on main after branch deletion — activation never moved them,
since `external` mode has no `backlog/` directory. The external tracker holds the source of truth;
these local files are scaffold that should be removed.

1. **Update the tracker**: Move the work item back to its pre-activation state (backlog / icebox /
   equivalent) in the external system.
2. **Delete local artifacts**:

   ```bash
   git rm .arc/active/{category}/prd-{name}.md \
          .arc/active/{category}/tasks-{name}.md \
          .arc/active/{category}/atomic-{name}.md
   ```

3. **Commit.** Under full protection, this deletion requires its own branch + PR. Under partial
   protection, direct commit to base is acceptable.

   ```bash
   git commit -m "docs(arc): deactivate {work-name} work unit

   Context: tasks-{name}.md (deactivation)"
   ```

Reactivation later re-renders artifacts from the tracker.

### Step 6: Clean Up Local Artifacts · `none` only

> **Skip this step** if `pm.mode` is `arc-in-git` or `external`.

Local `active/` artifacts are the only copies of the PRD, task list, and atomic companion. `none`
mode does not track dormant plans — if the content should be preserved for possible later reuse,
copy it out of `.arc/` first before deleting. ARC does not prescribe a destination under `none`
mode.

1. **Optional preservation**: Copy artifacts to a location outside `.arc/` if the content is worth
   keeping.
2. **Delete local artifacts**:

   ```bash
   git rm .arc/active/{category}/prd-{name}.md \
          .arc/active/{category}/tasks-{name}.md \
          .arc/active/{category}/atomic-{name}.md
   ```

3. **Commit.** Under full protection, this deletion requires its own branch + PR. Under partial
   protection, direct commit to base is acceptable.

   ```bash
   git commit -m "docs(arc): deactivate {work-name} work unit

   Context: tasks-{name}.md (deactivation)"
   ```

---

## When NOT to Deactivate

Cases B, C, and D from the Case Matrix route elsewhere. Each block below opens with a one-sentence
rationale for why the case is not deactivation.

### Case B — Not merged, some work executed → Pause

**Why this isn't deactivation:** Branch deletion discards in-flight task work; preservation via
state-field flip (pause) is the shift lifecycle's job, not deactivation's.

A WU with partial task work that the developer wants to park is `arc-shift` pause territory. Shift
uses a metadata-in-place pattern — the `State:` field flips to `Paused`, artifacts stay where they
are, no file relocation.

> **Status:** `arc-shift` is a future workflow (see `plan-arc-modes.md`). Until it ships, the
> recommendation for a WU with partial work is to either complete it via
> [`integrate-work-unit.md`][integrate] or abandon it via [`clean-work-unit.md`][clean] —
> attempting manual parking without `arc-shift` protocol support invites state drift.

### Case C — Merged to main, no work executed → Reversal PR (edge case)

**Why this isn't Case A:** Activation's changes are already on main as committed history, so branch
deletion alone can't restore pre-activation state.

**Procedure (rare):**

1. Create a new branch from main (e.g., `technical/deactivate-{name}`)
2. Reverse activation's changes on the branch:
    - `git mv` PRD / task list / atomic companion from `active/{category}/` back to
      `backlog/{category}/` (arc-in-git); or `git rm` them (external / none)
    - `git rm` the status file in `active/{category}/`
    - Restore pre-activation state in PROJECT-STATUS.md and ROADMAP.md
3. Open a deactivation PR (required under full protection; optional under partial)

This retains Case A's postconditions via explicit inverse commits. No separate workflow ships for
Case C — use this section as the reference.

### Case D — Merged to main, some work executed → Integrate or Clean

**Why this isn't deactivation:** Reversing merged history is the opposite of undo-activation; the
honest path is either finishing the WU or archiving it with abandoned status.

- **Complete and ship the WU**: finish remaining tasks, then [`integrate-work-unit.md`][integrate]
- **Abandon remaining work**: archive with abandoned status via [`clean-work-unit.md`][clean]

---

## Checklist Summary

Before considering the work unit deactivated, verify:

- [ ] Implementation branch deleted locally and on remote
- [ ] Any open PR for the branch closed without merge
- [ ] `arc-in-git`: artifacts back in `backlog/{category}/`; no status file in `active/`
- [ ] `external`: local artifacts removed; external tracker updated to pre-activation state
- [ ] `none`: local artifacts removed (preserved elsewhere first if desired)

## Postconditions

- Main matches pre-activation state for tracked ARC content
- No implementation branch for this WU exists locally or on remote
- Reactivation later starts from the equivalent pre-activation position (backlog entry, tracker
  item, or fresh planning round per mode)

---

## Next Step

No session-level next action follows deactivation. The developer decides what to work on next
independently — resume another WU, reactivate this one later, or start something new.

---

[activate]: activate-work-unit.md
[arc-config]: ../../../arc-config.yml
[clean]: clean-work-unit.md
[incidental]: ../supplemental/manage-incidental-work.md
[integrate]: integrate-work-unit.md
