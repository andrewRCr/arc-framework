---
purpose: Resume a parked work unit — re-attach its preserved branch to the active set and remove the tracked-branch pointer-record.
audience: agent
arc:
  extensions:
    - pre-push-review
---

# Workflow: Resume Work Unit

Bring a parked work unit back to the active set. `resume` is the inverse of park@Active. The
[`arc resume`](#3-run-arc-resume-from-a-base-checkout) verb owns the mechanics (branch re-attach, pointer-record
removal, side-effects); this workflow supplies the run-context and the ship legs.

`resume` operates only on a **`parked`** unit — a park@Active shelf, whose authoritative artifacts ride the
preserved branch while the tracked branch carries a pointer-record. Re-attaching restores the branch (a fresh
worktree by default, or `--here` in the current checkout) and removes the pointer; the artifacts come back on the
branch. Resolves to `active`.

A park@**Planning** unit resolved to `planned` (its full artifacts relocated to `backlog/planned/`, no preserved
branch) — it re-enters via `arc start {name}` (graduate, [`init-work-unit`][init-work-unit] Path A), **not**
`resume`. `arc start` on a parked unit routes to `resume`; on a planned stub it graduates.

> [!NOTE]
> **arc-in-git only.** `resume` reads the pointer-record from the `backlog/planned/` pipeline, which exists only
> under `pm.mode: arc-in-git`.

---

## Steps

### 1) Pre-condition gate

Confirm the target is a parked unit:

```bash
arc status {name}   # expect lifecycle state: parked
```

If the state is `planned` (a park@Planning shelf), re-enter via `arc start {name}` instead — there is no preserved
branch to re-attach. Any other state is not resumable.

### 2) Choose placement

- **Spawn** (default) — re-attach the preserved branch in a fresh worktree (isolation-by-default).
- **`--here`** — re-attach in the current checkout, no spawn. Honors the worktree-occupancy guard: refused if the
  current checkout already holds an active unit.

### 3) Run `arc resume` from a base checkout

Run from a **base-branch checkout** — the pointer-record lives on the tracked branch, so the executor resolves the
parked unit from the base index.

```bash
arc resume {name}          # spawn: re-attach in a fresh worktree
arc resume {name} --here   # in-place: re-attach in the current checkout
```

`{name}` defaults to the current worktree's unit when omitted. `arc resume` re-attaches the preserved branch — a
bare `git worktree add <path> <branch>` (spawn) or `git checkout <branch>` (`--here`), no `-b` — then **stages but
does not commit**: it removes the tracked-branch pointer-record, prunes the emptied parked dir, regenerates
`STATUS.USER`, and opens the user workspace. The authoritative artifacts return on the re-attached branch; the
pointer removal is the only change left on the tracked branch.

### 4) Ship per protection mode

`arc resume` left the pointer-record removal staged on the base tree. Commit and ship per
[Work Organization Strategy § Branch Protection Modes][work-org-protection]:

- **Partial** — a direct base commit.
- **Full** — ship the staged `meta-*` removal as a grooming change on a short-lived `chore/resume-{name}` branch +
  PR (the auto-merge lane), cut from the base checkout.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`. Subject per [`commit-format`][commit-format]; meta-file
> shape per [DEV-RULES.ARC § Atomicity][dev-rules-atomicity]:

```text
chore(arc): resume {name}

- Re-attach {name} to the active set; remove the parked pointer-record

Context: meta-{name}.md (resume)
```

**ROADMAP regen · `arc-in-git` only.** Resuming is a location move: re-render `backlog/ROADMAP.md` per
[§ ROADMAP][work-org-roadmap] — the unit leaves the **Parked** bucket and re-enters **In Flight**. `arc resume`
regenerated `STATUS.USER` (gitignored; not committed) and emitted the ROADMAP advisory but mints no ROADMAP — the
renderer is downstream. Default: a dedicated `chore(arc):` re-render commit, riding the resume commit only when the
delta is trivial.

Under full protection, push the grooming branch and open the PR:

- **Extensions** · `#pre-push-review`: If `pre-push-review` is in the active-extensions list, load and execute its
  `.actions` before the push. Otherwise, skip.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `-u origin chore/resume-{name}`.

```bash
gh pr create --base {base-branch} --head chore/resume-{name}
```

> [!IMPORTANT]
> `integration-interlock`: Stop before merge. Surface PR status (open threads, required approvals, checks); await
> explicit 'merge' direction before merging.

```bash
gh pr merge {pr-number} --squash   # or per merge.strategy
```

---

## Next step

The unit is active again, its artifacts back on the re-attached branch. Continue the
[task loop][process-task-loop] — on the spawn path, from the freshly re-attached worktree; on `--here`, in the
current checkout.

## Related workflows

- [`park-work-unit`][park] — the inverse; shelves a started unit (this resumes the park@Active result).
- [`init-work-unit`][init-work-unit] — re-enters a park@**Planning** unit (`planned`) via `start`/graduate, the
  branch this workflow does not cover.
- [`integrate-work-unit`][integrate] — the code-shipping lifecycle exit once the resumed work completes.

---

[park]: park-work-unit.md
[init-work-unit]: planning/init-work-unit.md
[integrate]: integrate-work-unit.md
[process-task-loop]: ../process-task-loop.md
[commit-format]: ../../../methods/commit-format.md
[dev-rules-atomicity]: ../../../../system/rules/DEV-RULES.ARC.md#atomicity
[work-org-protection]: ../../../../reference/strategies/arc/strategy-work-organization.md#branch-protection-modes
[work-org-roadmap]: ../../../../reference/strategies/arc/strategy-work-organization.md#roadmap
