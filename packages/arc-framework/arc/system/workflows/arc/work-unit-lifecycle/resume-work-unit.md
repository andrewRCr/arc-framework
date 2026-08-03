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
WU-owned worktree by default, or the explicit `--here` checkout) and removes the pointer; the artifacts come back on
the branch. Resolves to `active`.

A park@**Planning** unit resolved to `planned` (its full artifacts relocated to `backlog/planned/`, no preserved
branch) — it re-enters via `arc start {name}` (initialize, [`init-work-unit`][init-work-unit] Path A), **not**
`resume`. `arc start` on a parked unit routes to `resume`; on a planned stub it initializes it.

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

- **Spawn** (full-protection default) — re-attach the preserved branch in a fresh WU-owned worktree.
- **`--here`** — explicitly convert the current checkout into the WU-owned checkout. The session locus occupancy
  guard refuses an occupied checkout rather than displacing its role. When this is the physical primary, it is
  unavailable to
  transient work and other WUs until exact WU teardown restores record-free base. Physical branch checkout is
  deferred until after the ship commit; follow the continuation emitted by the verb in Step 4.

### 3) Run `arc resume` from a base checkout

Run from a **base-branch checkout** — the pointer-record lives on the tracked branch, so the executor resolves the
parked unit from the base index.

```bash
arc resume {name}          # spawn: re-attach in a fresh worktree
arc resume {name} --here   # in-place: re-attach in the current checkout
```

`{name}` defaults to the current worktree's unit when omitted. `arc resume` **stages but does not commit** — it
removes the tracked-branch pointer-record, prunes the emptied parked dir, regenerates `STATUS.USER`, and opens the
user workspace. The pointer removal is the only change left on the tracked branch; the authoritative artifacts ride
the re-attached branch. The verb establishes the exact WU-owned checkout in both placement modes; re-attachment
differs only in when the physical checkout becomes visible:

- **Spawn** re-attaches immediately in a fresh worktree; cwd stays on the tracked branch, so the removal commits
  there cleanly in Step 4.
- **`--here` defers the physical checkout.** Switching off the tracked branch before the removal is committed would
  discard it and orphan the pointer. The primary is already reserved for the WU while this continuation is
  pending; do not use it as a transient launchpad.

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

Context: meta-{name}.md (maintenance)
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

**`--here` re-attach (after the removal lands on the base).** Once the pointer removal is committed on the tracked
branch, execute the exact in-place continuation emitted by `arc resume`. The artifacts return on the preserved
branch, and the physical primary remains the WU-owned occupied checkout. Spawn needs no continuation — its worktree
re-attached in Step 3.

### 5) Reconcile from the re-attached work-unit branch

Enter the dependent's own checkout after the tracked-branch pointer removal has landed:

- **Spawn** — change to the fresh worktree reported by `arc resume`.
- **`--here`** — remain in the current checkout after the deferred `git checkout {branch}` above.

Run the bounded current-WU reconcile from that checkout:

```bash
arc wu reconcile {name} --attach-session --apply --json
```

- `clean` — continue without a write, stage, or commit.
- `pending` — stop and surface every advisory reference. Inspect the referenced content; either edit it in this
  dependent-owned review increment and rerun until `clean` / `applied`, or obtain explicit user direction to retain
  the advisory as intentional before continuing. Never classify this schema-valid result as malformed.
- `applied` — commit only the staged dependent-owned paths on the preserved WU branch:

  > [!CAUTION]
  > `commit-interlock` release — commit as `workflowCommit`.

  ```text
  chore(arc): reconcile {name} after resume

  - Apply reachable retirement dispositions from the dependent's own branch

  Context: meta-{name}.md (maintenance)
  ```

- `conflict` — stop the resume workflow on the re-attached branch and surface the typed reason. The base-side
  pointer removal is already committed; do not rewrite or pretend to roll back that separate ceremony commit.

---

## Next step

The unit is active again, its artifacts back on the re-attached branch. Continue the
[task loop][process-task-loop] from that WU-owned checkout. On `--here`, do not treat the physical primary as free
until the unit's exact teardown restores record-free base.

## Related workflows

- [`park-work-unit`][park] — the inverse; shelves a started unit (this resumes the park@Active result).
- [`init-work-unit`][init-work-unit] — re-enters a park@**Planning** unit (`planned`) via `start`/`init`, the
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
