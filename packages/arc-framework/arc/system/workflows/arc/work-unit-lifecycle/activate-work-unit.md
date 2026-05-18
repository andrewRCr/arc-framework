---
purpose: Transition a work unit from Planning to Active — state-flip, branch rename, capture-pipeline absorption.
audience: agent
arc:
  methods:
    - branch-format
  extensions:
    - pre-activation
    - post-work-unit-activate
---

# Workflow: Activate Work Unit

Transition an existing WU from `**State:** Planning` to `**State:** Active` via in-place state-flip and branch
rename `plan/<name>` → `<type>/<name>`. No new branch, no directory move — the WU stays on its existing branch with
its artifacts in `active/`.

**When to use:** After `2_generate-tasks.md` produces the task list, when ready to begin implementation.

> [!NOTE]
> **No WU on this branch?** If no `plan/<name>` branch is checked out, or `active/meta-{name}.md` does not exist,
> start with [`init-work-unit.md`][init-work-unit] instead. This workflow transitions an existing WU; it does not
> create one.

---

## Steps

### 1) Pre-condition gate

Verify the activation context is well-formed:

- Currently on a `plan/<name>` branch (per [`branch-format`][branch-format])
- `.arc/active/meta-{name}.md` exists and shows `**State:** Planning`
- `.arc/active/prd-{name}.md` and `.arc/active/tasks-{name}.md` are present

If any check fails, surface the mismatch and halt — do not proceed to state-flip or branch rename.

### 2) Fire `pre-activation` extension

If `pre-activation` appears in the active-extensions list (established at session init), load and execute its
`.actions`. Halt-on-fail surfaces an actionable message; user can fix-and-retry or explicit-invoke bypass.
Otherwise, skip.

### 3) Supplementary alignment checks

#### PROJECT-PRD

Fires only when PROJECT-PRD has been edited since the WU's PRD was approved. Soft check; rarely blocks. Surface
any conflict with the WU's PRD; on conflict, halt and ask.

#### TECHNICAL-OVERVIEW

Fires only when TECHNICAL-OVERVIEW has been edited since the WU's PRD was approved **and** the PRD touches
technical surfaces (tech stack, architecture, runtime, dependencies, infrastructure). Soft check; rarely blocks.
Independent of the PROJECT-PRD check — scope distinction is the trigger.

### 4) State-flip + plan-doc removal

Edit `active/meta-{name}.md`: `**State:** Planning` → `**State:** Active`.

Remove any residual plan-doc:

```bash
git rm .arc/active/plan-{name}.md
```

Safety-catch — the plan-doc should already be absent (deleted at PRD creation per `1_create-prd.md`); this covers
paths that skipped the create-PRD boundary.

Stage both edits.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit`:

```text
docs(arc): activate {work-name} work unit

- Flip State: Planning → Active
- Remove plan-{name}.md (graduated to PRD; safety-catch)

Context: meta-{name}.md (activation)
```

### 5) Branch rename · 3-step routing

- **Extensions** · `#pre-push-review`: If `pre-push-review` appears in the active-extensions list
  (established at session init), load and execute its `.actions` before the `workflowPush` push.
  Halt-on-fail surfaces an actionable message; user fix-and-retries or explicit-invoke bypasses.
  Otherwise, skip.

```bash
git branch -m plan/{name} {type}/{name}    # local rename (raw)
git push -u origin {type}/{name}            # workflowPush
git push origin --delete plan/{name}        # raw — destructive flag stays literal
```

`<type>` per [`branch-format`][branch-format]. The wrapper refuses `--delete` by design, so the old-remote
deletion stays as raw `git`. See [Work Organization Strategy § Branching][work-org-branching] for the rename's
role in the WU lifecycle.

Reaffirm the per-WU user workspace subdir (idempotent on prior `init-work-unit` invocation;
covers paths that activated without going through `init-work-unit` first):

```bash
arc user open {name}
```

### 6) Absorption write · `arc-in-git` only

> **Skip this step** under `pm.mode: none` or `external`.

If activation absorbs queued inbox entries — `user/{identity}/USER-INBOX.md` (`## Atomic` / `## Backlog` sections)
or shared `backlog/ATOMIC-INBOX.md` / `backlog/BACKLOG-INBOX.md` — into this WU's task list or atomic companion,
finalize absorption now. Delete the source entries; record routing in the commit message.

The absorbing-artifact edits (task list, atomic companion) typically already landed during planning; this step
lands the source deletions as the ceremony write (`workflowCommit`).

See [DEV-RULES.ARC § Leave it cleaner][dev-rules-leave-cleaner] for the capture-routing table.

### 7) ROADMAP regen · `arc-in-git` only

> **Skip this step** under `pm.mode: none` or `external`.

Hand-maintain (interim, pre-CLI) per [Work Organization Strategy § ROADMAP][work-org-roadmap]: update the WU's
tier placement to reflect its new `Active` state.

Default: dedicated `chore(arc):` commit (`workflowCommit`). May ride the activation commit (Step 4) only when the
edit is trivial (single tier-line move) — see [DEV-RULES.ARC § Atomicity][dev-rules-atomicity].

### 8) Fire `post-work-unit-activate` extension

If `post-work-unit-activate` appears in the active-extensions list, load and execute its
[`.actions`][arc-ext-post-activate]. Otherwise, skip. Stage any extension-produced changes as a dedicated
commit (`workflowCommit`) per the extension's contract.

---

## Next Step

With activation complete, proceed to task execution:

**→ [3_process-task-loop.md](../3_process-task-loop.md)** — Execute tasks with quality gates.

## Related Workflows

- [`init-work-unit.md`][init-work-unit] — preceding ceremony; creates the WU on `plan/<name>`.
- [`integrate-work-unit.md`][integrate-work-unit] — succeeding ceremony; PR-open through merge.

---

[init-work-unit]: planning/init-work-unit.md
[integrate-work-unit]: integrate-work-unit.md
[branch-format]: ../../../methods/branch-format.md
[arc-ext-post-activate]: ../../../extensions/post-work-unit-activate.md
[work-org-branching]: ../../../../reference/strategies/arc/strategy-work-organization.md#branching
[work-org-roadmap]: ../../../../reference/strategies/arc/strategy-work-organization.md#roadmap
[dev-rules-leave-cleaner]: ../../../../reference/constitution/DEV-RULES.ARC.md#leave-it-cleaner
[dev-rules-atomicity]: ../../../../reference/constitution/DEV-RULES.ARC.md#atomicity
