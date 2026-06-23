---
purpose: Withdraw an Integrating work unit back to Active for more work — phase-flip Integrating → Active plus PR withdrawal.
audience: agent
arc:
  methods:
    - branch-format
    - commit-footer
  extensions:
    - pre-push-review
---

# Workflow: Reopen Work Unit

Pull a work unit out of review back to active work — the inverse of [`integrate-work-unit.md`][integrate]. A
`set-phase`-only move (`Integrating → Active`, no location move and no branch rotation — the working branch keeps the
`<type>/` prefix it took at activation) that withdraws the open PR.

**When to use:** A WU sits in `**State:** Integrating` (PR open, awaiting review), but it needs substantial rework
before it can merge — a reviewer requested changes large enough to leave review for, or a problem surfaced that more
task work must address. Withdrawing returns it to `Active` and pulls the PR out of review.

> [!NOTE]
> **PR already merged?** `reopen` refuses a merged PR (the `pr-unmerged` guard) — backing out merged work is a new
> origin-linked follow-up WU, not a reopen. See § Related workflows.

---

## Prerequisites

- Currently on the WU's `<type>/<name>` branch (per [`branch-format`][branch-format])
- `.arc/active/meta-{name}.md` exists and shows `**State:** Integrating`
- The WU's PR is open and **not merged** (a draft PR still qualifies; a merged PR does not)

---

## Steps

### 1) Settle the withdrawal + mode (judgment)

The judgment `reopen` carries is the withdraw-vs-stay-integrating call: pull out of review only when the remaining work
is substantial enough that churning the open PR through it is worse than withdrawing. Minor review-driven fixes stay in
[`integrate-work-unit.md`][integrate] Step 4 (review iteration) — they don't warrant a reopen.

Then choose how the PR is withdrawn:

- **close** (default) — close the PR outright; the review thread ends, the branch stays. Use when the withdrawal is
  open-ended.
- **draft** (`--keep-pr`) — convert the PR back to a draft, leaving it open but out of active review. Use when the same
  PR will resume shortly and its thread / URL are worth preserving.

### 2) Run the `reopen` transition

```bash
arc reopen {name}            # close the PR (default)
arc reopen {name} --keep-pr  # convert the PR to a draft instead
```

The executor fires the `reopen` edge: flips `**State:** Integrating → Active`, clears the now-stale integration
`**Next Action:**` pointer (`**Next Task:**` stays `[none]` from `integrate`), and fires the `withdraw-pr`
side-effect — `gh pr close` (default) or `gh pr ready --undo` (`--keep-pr`). `{name}` defaults to the current
worktree's WU.

The PR's merge fact is resolved live against `gh` (never fabricated); when `gh` or the remote is unavailable the
reopen degrades open rather than blocking — only a positively-merged PR is refused. A non-`Integrating` source falls
to the table's illegal-edge rejection.

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

### 4) Resume task work

The WU is back in `**State:** Active`. Return to task execution per [`process-task-loop.md`][process-task-loop] and
address the rework that prompted the withdrawal. `reopen` left `**Next Task:**` / `**Next Action:**` at `[none]`; they
re-establish at the next handoff, or set them by hand if orientation is needed before then.

---

## Next step

Active task work resumes. When the rework is complete and the WU is ready to ship again, re-enter
[`integrate-work-unit.md`][integrate] — `arc status {name} --json` reads `active` again, so it enters fresh.

## Related workflows

- [`integrate-work-unit.md`][integrate] — the inverse; Active → Integrating (open review).
- [`deactivate-work-unit.md`](deactivate-work-unit.md) — the other phase-axis reversal; Active → Planning (own-file
  precedent).
- Backing out **merged** work has no reopen path: open a new origin-linked follow-up WU (its `**Origin:**` records the
  continuation).

---

[branch-format]: ../../../methods/branch-format.md
[commit-footer]: ../../../methods/commit-footer.md
[integrate]: integrate-work-unit.md
[process-task-loop]: ../process-task-loop.md
[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md
