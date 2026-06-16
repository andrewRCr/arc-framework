---
purpose: Park a started work unit off the active set — shelve it for resumable later pickup, preserving an Active branch as the durable shelf.
audience: agent
arc:
  extensions:
    - pre-push-review
---

# Workflow: Park Work Unit

Shelve a started work unit off the active set, freeing the worktree while leaving the unit resumable. `park` is the
inverse of `start`. The [`arc park`](#3-run-arc-park-from-a-base-checkout) verb owns the mechanics (relocate /
branch-preserve / worktree teardown / pointer-record / side-effects); this workflow supplies the judgment, the
run-context, and the ship legs.

`park` is **phase-polymorphic** over `**State:**`:

- **park@Active** — code exists; the pushed branch is **preserved** as the durable shelf, only the worktree is torn
  down, and a fresh **pointer-record** lands on the tracked branch (the authoritative artifacts ride the preserved
  branch, never moved). Resolves to `parked`.
- **park@Planning** — no code yet; the `plan/<name>` branch is torn down (re-cut on resume) and the artifacts
  relocate `active/ → backlog/planned/`. Resolves to `planned`.

**When to use:** A started unit must step aside without being abandoned — a deliberate, resumable pause. Choosing
`park` over [`abandon`][deactivate] *is* the resume commitment. Never pause by leaving a unit idle in `active/`:
`active/` holds one unit per worktree, and a stale second unit breaks the release wrapper and session-init.

> [!NOTE]
> **arc-in-git only.** `park` relocates into the `backlog/planned/` pipeline, which exists only under
> `pm.mode: arc-in-git`.

---

## Steps

### 1) Resolve the arm & gate

From the unit's `**State:**` in `active/meta-{name}.md`:

- `Active` → **park@Active** · `Planning` → **park@Planning**.
- `Integrating` → **stop.** Withdraw the open PR via `arc reopen` first, then park. `arc park` refuses an
  Integrating unit directly.

### 2) Judgment — the reason & commitment

Compose the **`--reason`** — required, never fabricated — from the actual cause for stepping aside (blocked
dependency, priority pivot, awaiting a decision). It is rendered into the park@Active pointer-record's callout and
the park@Planning relocated meta. Confirm this is a resumable pause, not a teardown — if the unit will not be
resumed, the transition is [`abandon`][deactivate].

### 3) Run `arc park` from a base checkout

Run from a **base-branch checkout**, never the unit's own worktree — `arc park` refuses a WU-branch context (the
shared write-context guard) and offers a hop to the base worktree. park@Active renders the pointer-record on the
tracked branch while the preserved branch keeps its authoritative `active/`; park@Planning relocates on the tracked
branch, so basing the run there keeps the staged result committable after the worktree teardown.

For **park@Active**, push the preserved branch first — it is the durable shelf and the worktree is about to be
removed:

```bash
git -C <wu-worktree-path> push   # raw — ensure the shelf survives teardown
```

Then, from the base checkout:

```bash
arc park {name} --reason "<why this unit is being shelved>"
```

`{name}` defaults to the current worktree's unit when omitted. `arc park` **stages but does not commit**: it
relocates (Planning) or renders the pointer-record (Active), preserves or deletes the branch, tears down the unit's
worktree (refusing on uncommitted work), regenerates `STATUS.USER`, closes the user workspace, and emits a ROADMAP
regen advisory. The relocate + teardown choreography is the single-source park-exit block authored in
[`decompose-work-unit`][decompose] § [The park-exit block](decompose-work-unit.md#the-park-exit-block); `park`
drives it through the verb rather than re-spelling it.

### 4) Ship per protection mode

`arc park` left its result staged on the base tree. Commit and ship per
[Work Organization Strategy § Branch Protection Modes][work-org-protection]:

- **Partial** — a direct base commit.
- **Full** — ship the staged `meta-*` / `draft-*` grooming change on a short-lived `chore/park-{name}` branch + PR
  (the auto-merge lane), cut from the base checkout.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`. Subject per [`commit-format`][commit-format]; meta-file
> shape per [DEV-RULES.ARC § Atomicity][dev-rules-atomicity]:

```text
chore(arc): park {name}

- Shelve {name} off the active set ({park@Active: preserve branch + pointer-record | park@Planning: relocate to backlog/planned/, drop plan branch})
- Reason: {reason}

Context: meta-{name}.md (park)
```

**ROADMAP regen · `arc-in-git` only.** Parking is a location move: re-render `backlog/ROADMAP.md` per
[§ ROADMAP][work-org-roadmap] — park@Active joins the **Parked** bucket; park@Planning re-tiers to **Blocked** /
**Ready** by its dependencies. `arc park` regenerated `STATUS.USER` (gitignored; not committed) and emitted the
ROADMAP advisory but mints no ROADMAP — the renderer is downstream. Default: a dedicated `chore(arc):` re-render
commit, riding the park commit only when the delta is trivial.

Under full protection, push the grooming branch and open the PR:

- **Extensions** · `#pre-push-review`: If `pre-push-review` is in the active-extensions list, load and execute its
  `.actions` before the push. Otherwise, skip.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `-u origin chore/park-{name}`.

```bash
gh pr create --base {base-branch} --head chore/park-{name}
```

> [!IMPORTANT]
> `integration-interlock`: Stop before merge. Surface PR status (open threads, required approvals, checks); await
> explicit 'merge' direction before merging.

```bash
gh pr merge {pr-number} --squash   # or per merge.strategy
```

The worktree teardown already ran inside `arc park` (Step 3) — no separate teardown step. park@Active preserved the
branch (the shelf); park@Planning deleted the `plan/` branch.

---

## Next step

Resume later with `arc resume {name}` — driven by the [`resume-work-unit`][resume] ceremony (the inverse) — which
re-attaches the preserved branch (spawn by default, or `--here`) and removes the pointer-record. `arc start {name}`
on a parked unit routes to `resume`.

## Related workflows

- [`resume-work-unit`][resume] — the inverse; re-attaches this park@Active shelf.
- [`init-work-unit`][init-work-unit] — the `start`-family forward edge (`backlog/planned/ → active/`); park@Planning
  reverses its graduate.
- [`decompose-work-unit`][decompose] — shares the single-source park-exit relocate + teardown choreography.
- [`deactivate-work-unit`][deactivate] — the destructive sibling (`abandon`); park is the resumable alternative.
- [`integrate-work-unit`][integrate] — the code-shipping lifecycle exit; contrast with this resumable pause.

---

[resume]: resume-work-unit.md
[init-work-unit]: planning/init-work-unit.md
[decompose]: decompose-work-unit.md
[deactivate]: deactivate-work-unit.md
[integrate]: integrate-work-unit.md
[commit-format]: ../../../methods/commit-format.md
[dev-rules-atomicity]: ../../../../system/rules/DEV-RULES.ARC.md#atomicity
[work-org-protection]: ../../../../reference/strategies/arc/strategy-work-organization.md#branch-protection-modes
[work-org-roadmap]: ../../../../reference/strategies/arc/strategy-work-organization.md#roadmap
