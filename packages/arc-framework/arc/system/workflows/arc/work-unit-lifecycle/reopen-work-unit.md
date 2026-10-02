---
purpose: Withdraw an Integrating work unit back to Active task execution or Candidate preparation.
audience: agent
arc:
  methods:
    - branch-format
    - commit-footer
  extensions:
    - pre-push-review
---

# Workflow: Reopen Work Unit

Pull a work unit out of public integration back to private work — the inverse of the publication transition in
[`prepare-work-unit.md`][prepare]. A `set-phase`-only move (`Integrating → Active`, no location move and no branch
rotation — the working branch keeps the `<type>/` prefix it took at activation) that withdraws the open PR. An
exact reopened-task input returns to execution; otherwise the ordinary destination is Candidate preparation.

**When to use:** A WU sits in `**State:** Integrating` (PR open, awaiting review), but it needs substantial rework
before it can merge — a reviewer requested changes large enough to leave public review for, or a problem surfaced
that needs private convergence. Withdrawing returns it to Candidate-bearing `Active` and pulls the PR out of review.

> [!NOTE]
> **PR already merged?** `reopen` refuses a merged PR (the `pr-unmerged` guard) — backing out merged work is a new
> origin-linked follow-up WU, not a reopen. See § Related workflows.

---

## Prerequisites

- Currently on the WU's `<type>/<name>` branch (per [`branch-format`][branch-format])
- `.arc/active/meta-{name}.md` exists and shows `**State:** Integrating`
- The WU's PR is open and **not merged** (a draft PR still qualifies; a merged PR does not)
- The canonical task list has exactly the intended shape: a found executable cursor for `--task`, or
  `no-open-task` when reopening directly to Candidate preparation

---

## Steps

### 1) Settle the withdrawal + mode (judgment)

The judgment `reopen` carries is the withdraw-vs-stay-integrating call: pull out of review only when the remaining work
is substantial enough that churning the open PR through it is worse than withdrawing. Minor review-driven fixes stay in
[`integrate-work-unit.md`][integrate] Step 2 (review iteration) — they don't warrant a reopen.

Then choose how the PR is withdrawn:

- **close** (default) — close the PR outright; the review thread ends, the branch stays. Use when the withdrawal is
  open-ended.
- **draft** (`--keep-pr`) — convert the PR back to a draft, leaving it open but out of active review. Use when the same
  PR will resume shortly and its thread / URL are worth preserving.

A withdrawal driven by a finding that changes the design record enters through [`amend-design`][amend-design]
first: its [entry gate][amend-design-gate] settles what changes, and the corrective parent is authored and
committed before the reopen runs, so `--task` has an executable leaf to anchor on. A coherently bound delivery
refuses here (Step 2) — that correction runs through [`deliver-stack`][deliver-stack]'s review-fix continuation
instead.

### 2) Run the `reopen` transition

```bash
arc reopen {name}            # close the PR (default)
arc reopen {name} --keep-pr  # convert the PR to a draft instead
arc reopen {name} --keep-pr --task "Task X.R.a — ..."  # resume at the corrective parent's executable leaf
```

The verb first establishes exact delivery composition through its typed read-only projection. Determinate delivery
absence and a coherent unbound plan retain ordinary withdrawal. A coherently bound delivery, or unavailable,
contradictory, or malformed delivery evidence, refuses before PR observation or lifecycle mutation; never approximate
delivery-wide withdrawal by closing or drafting only the terminal request.

Before mutation, the executor resolves the canonical task list. `--task` must equal
`Task {cursor.id} — {cursor.title}` for the current executable leaf; without `--task`, the list must resolve
`no-open-task`. Missing, unreadable, unbound, malformed, mismatched, or mode-inconsistent task authority refuses
with the exact corrective boundary.

The executor then fires the `reopen` edge: flips `**State:** Integrating → Active`, clears the now-stale integration
`**Next Action:**` pointer, and fires the `withdraw-pr` side-effect — `gh pr close` (default) or
`gh pr ready --undo` (`--keep-pr`). Without `--task`, `**Next Task:**` stays `[none]` and `Current Workflow`
returns to `prepare-work-unit`. With an exact `--task`, the transition writes that orientation and sets
`Current Workflow` to `process-task-loop`, returning the Active work unit to task execution. `{name}` defaults to the
current worktree's WU. Candidate currentness remains mandatory before prepublication resumes; reopened task
execution carries no review or publication authority from the stale Candidate.

The PR's merge fact is resolved live against `gh` (never fabricated); the guard clears only a positively-unmerged
PR. A merged PR is refused, and so is an unverifiable merge state — when `gh` or the remote is unavailable the reopen
refuses rather than reopen on an unconfirmable PR (the withdraw leg needs `gh` anyway, so degrading open would only
flip the meta and strand a half-done reopen). A non-`Integrating` source falls to the table's illegal-edge rejection.

Stage the meta edit.

> [!CAUTION]
> `commit-interlock` release — commit as `workflowCommit` (subject `chore(arc):` per [DEV-RULES.ARC][dev-rules-arc]
> § Commit Discipline, meta-file commit shape):

```text
chore(arc): reopen {name}

- Flip State: Integrating → Active
- Withdraw PR ({close | draft})

Context: meta-{name}.md (maintenance)
```

`(maintenance)` is the accepted footer for a lifecycle move with no category marker of its own — see the
[`commit-footer`][commit-footer] method § Meta-file references.

### 3) Push to sync the withdrawal

The branch is already upstream (the PR was open). Push the state-flip commit so the remote reflects `Active` — and,
under `--keep-pr`, so the draft PR carries it.

- **Extensions** · `#pre-push-review`: If `pre-push-review` appears in the active-extensions list (established at
  session init), load and execute its `.actions` before the push. Halt-on-fail surfaces an actionable message; user
  fix-and-retries or explicit-invoke bypasses. Otherwise, skip.

> [!CAUTION]
> `push-interlock` release — `workflowPush`: `origin {type}/{name}`.

### 4) Resume execution or Candidate preparation

With `--task`, resume [`process-task-loop.md`](../process-task-loop.md) at the exact canonical cursor. When the final
task closes, session init and recovery project `verify-work-unit` until Candidate attestation. Without `--task`, the
already-closed WU is back in
Candidate-bearing `**State:** Active`, which projects `sessionType: prepublication` and `workflow:
prepare-work-unit`; return to [`prepare-work-unit.md`][prepare]. Candidate currentness and review procedures account
for head-changing fixes; never route from the cleared narrative `**Next Action:**` field.

---

## Next step

Reopened execution, when selected, returns through work-unit verification and establishes a new Candidate root.
Candidate preparation then resumes. When it settles, `arc publish` schedules public integration again and hands
back to [`integrate-work-unit.md`][integrate].

## Related workflows

- [`prepare-work-unit.md`][prepare] — owns the inverse `publish` transition; Active → Integrating.
- [`integrate-work-unit.md`][integrate] — the public integration phase this workflow withdraws from.
- [`deactivate-work-unit.md`](deactivate-work-unit.md) — the other phase-axis reversal; Active → Planning (own-file
  precedent).
- Backing out **merged** work has no reopen path: open a new origin-linked follow-up WU (its `**Origin:**` records the
  continuation).

---

[branch-format]: ../../../methods/branch-format.md
[commit-footer]: ../../../methods/commit-footer.md
[integrate]: integrate-work-unit.md
[prepare]: prepare-work-unit.md
[deliver-stack]: ../supplemental/deliver-stack.md
[amend-design]: ../supplemental/amend-design.md
[amend-design-gate]: ../supplemental/amend-design.md#entry-gate
[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md
