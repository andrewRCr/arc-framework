---
purpose: Execute an out-of-work-unit errand end to end as a re-enterable Launch → Execute → Integrate lifecycle dispatched by arc-session — one review increment, no task list.
audience: agent
arc:
  methods:
    - assess-parallel-fit
    - commit-footer
  extensions:
    - post-task-quality
    - pre-pr-review
    - pre-push-review
    - pre-merge-review
---

# Workflow: Run Errand

Execution body for an **errand** — a single bounded out-of-work-unit concern — entered warm from an active
session via the `arc-errand` skill, cold via the `arc-session` skill (`--errand`, or adopted from
session-init's discovery arm), or directly from a [`drain-inbox`][drain-inbox] execution transition when the
housekeep drain hands off a committed atomic. For what
distinguishes an errand from a work unit, see [strategy-work-organization § Errand Work Class][errand-class];
this workflow runs one.

An errand is **one review increment**, so this workflow honors the [Review-Increment Invariant][dev-rules-arc]
directly and does **not** load `process-task-loop` (there is no task list). Its phases — Launch → Execute →
Integrate — are **re-enterable**: a paused errand resumes where it left off, and pausing mid-errand is `commit
WIP + push` — the pushed `chore/<slug>` branch and the originating inbox entry carry continuity, with no
SESSION-NOTES.

## Launch

Confirm the work is an errand, check for in-flight overlap, and relocate the execution locus to an isolated
base-derived branch — so the errand never executes from an unrelated work unit's branch.

1. **Classify — errand vs. work unit.** Confirm the work is a single bounded concern that fits one review
   increment. Multi-increment or design-bearing scope is a work unit, not an errand — route it through
   [`init-work-unit`][init-work-unit] instead. (Scope that *explodes mid-execution* is handled by Execute's
   promote-to-WU primer.) See [strategy-work-organization § Errand Work Class][errand-class] for the boundary.

2. **Check for foreign overlap — apply [`assess-parallel-fit`][assess-parallel-fit] (overlap read only).** Run the
   overlap check against the paths the errand will touch:

   ```bash
   arc errand check --target <path>... --json
   ```

   It emits `{overlaps, reachable}` — which in-flight work units touch the same paths, across worktrees and
   machines (via the in-flight oracle), fresher here at execution time than at capture. Apply the method's overlap
   read to those facts: the rubric and the all-owner gate (foreign-owned → coordinate). An errand has no design
   stage, so the design-load read does not apply. **Advisory, never a gate:** surface any overlap so you can
   coordinate or sequence the errand after the other unit integrates, then proceed. If the remote is unreachable
   the check degrades to local refs and says so.

3. **Resolve the base and relocate the locus.** The errand executes from a base-derived locus, never the
   branch you launched from — launching from any worktree (a work unit's included) is fine; only *executing*
   there would tangle that branch. Resolve the base branch and primary worktree with the shared write-context
   resolution — `arc housekeep check --json` exposes the same primitive; read its `baseBranch` and
   `primaryWorktreePath` (the `verdict` is the housekeep guard's concern, not the errand's). Then relocate per
   protection mode ([§ Branch Protection Modes][branch-modes]):

   - **Full protection** — cut `chore/<slug>` off the configured base branch with `arc errand cut <slug>`
     (idempotent — no-clobber if it already exists). Then occupy it: where worktree spawning is available,
     spawn an **ephemeral worktree** on the branch so the errand runs isolated from the launching worktree;
     otherwise switch to it in the primary worktree's base checkout. `<slug>` is branch-safe
     (lowercase, digits, hyphens) and doubles as the merge key.
   - **Partial protection** — no branch: target the primary worktree's base checkout directly. The errand
     lands as a direct base-branch commit (a documented off-work-unit maintenance exception).

   The `chore/<slug>` branch is cut lazily here, not earlier — an errand that never launches leaves no dangling
   branch.

## Execute

Do the errand as a **single review increment**, honoring the [Review-Increment Invariant][dev-rules-arc]
directly.

**Scope explosion → promote, don't grow.** If the errand outgrows one review increment — it needs design
decisions, several increments, or a task list — stop expanding it in place. Promote it to a work unit via
[`init-work-unit`'s Promote Errand to Work Unit path][promote-errand-to-wu] (mint a `meta-*`, rename
`chore/<slug>` → `<type>/<name>`, preserve the commits already made), then continue under the work-unit
lifecycle. The errand's commits carry forward intact.

Otherwise, make the change and run the project's Tier 1 quality gates on what you touched.

- **Extensions** · `#post-task-quality`: If `post-task-quality` appears in the active-extensions list
  (established at session init), load and execute its `.actions`. Otherwise, skip.

> [!IMPORTANT]
> `workflow-interlock`: Stop after the errand change is complete and its quality gates pass. Surface the diff
> and verification status; await approval before proceeding to Integrate (commit, then PR/merge or direct base
> commit).

## Integrate

Land the errand and clean up. The commit carries a `standalone (...)` context footer — no active work unit
owns it — and the rest of Integrate branches on protection mode.

### Commit

> [!CAUTION]
> `commit-interlock` release — commit as `taskCommit` (an errand is one review increment, so its commit
> releases at the increment-approval gate above):

```text
<type>(<scope>): <errand summary>

Context: standalone (<kind>)
```

See the [`commit-footer` method][commit-footer] for the `standalone (...)` parenthetical set.

### Ship — full protection

1. **Classify the merge lane** by what the errand touched ([§ Auto-Merge Lane][auto-lane]): a code errand is
   **reviewed-lane** (code always reviewed) and ships 1:1 on its own PR; a pure planning- or doc-grooming
   errand may be **auto-merge-lane**.

2. **Push** `chore/<slug>` upstream.

   - **Extensions** · `#pre-push-review`: If `pre-push-review` appears in the active-extensions list
     (established at session init), load and execute its `.actions` before the push. Halt-on-fail surfaces an
     actionable message; user fix-and-retries or explicit-invoke bypasses. Otherwise, skip.

   > [!CAUTION]
   > `push-interlock` release — `workflowPush`: `-u origin chore/<slug>`.

3. **Open the PR** with a **lean errand body** — `template-pull-request` assumes a work unit, so inline a
   minimal body instead: a one-line Summary (what the errand does and why), plus a one-line Test Plan only when
   verification is non-obvious. No Spec / Out-of-Scope / Follow-Up sections — an errand is one concern.

   - **Extensions** · `#pre-pr-review`: If `pre-pr-review` appears in the active-extensions list, load and
     execute its `.actions` before opening the PR. Halt-on-fail surfaces an actionable message; user
     fix-and-retries or explicit-invoke bypasses. Otherwise, skip.

   ```bash
   gh pr create --base <base-branch> --head chore/<slug>
   ```

> [!IMPORTANT]
> `integration-interlock`: Stop before arming auto-merge or merging. Surface PR status (checks, required
> approvals) and the resolved lane; await explicit integration approval before proceeding — never infer merge
> approval from the increment approval above.

4. Fire the pre-merge review, then land per lane:

   - **Extensions** · `#pre-merge-review`: If `pre-merge-review` appears in the active-extensions list, load
     and execute its `.actions` before the merge. Halt-on-fail surfaces an actionable message; user
     fix-and-retries or explicit-invoke bypasses. Otherwise, skip.

   **Auto-merge-lane** — resolve `merge.strategy` via the config probe, then arm native auto-merge with the
   matching merge method (`merge` → `--merge`, `squash` → `--squash`, `rebase` → `--rebase`). Do not parse
   `arc-config.yml` directly; use `arc config status --json` and read `settings["merge.strategy"]`.

   ```bash
   arc config status --json   # read settings["merge.strategy"]
   gh pr merge <pr-number> --auto <merge-flag>
   ```

   **Reviewed-lane** — leave the PR open for owner review; it merges on approval.

### Ship — partial protection

No branch and no PR: the errand is already a direct base-branch commit, so there is no merge step. The
base-branch push follows the project's normal base-push discipline.

### Complete

On merge (full) or commit (partial), tear down the locus and clear the capture:

- **Remove the errand locus** (full only) — remove any ephemeral worktree spawned at Launch before deleting the
  local `chore/<slug>` branch. Do not pass `--delete-branch` to `gh pr merge` while the errand branch is still
  checked out in an ephemeral worktree; Git refuses to delete a branch that any worktree is using. If the host
  does not delete the remote PR branch as part of merge, delete the remote branch after merge independently.
- **Prune the stale remote-tracking ref** (full only) — `git fetch --prune origin` after the merge, so the
  merged-and-deleted `origin/chore/<slug>` ref doesn't linger and surface as phantom in-flight. Targeted here
  because the slug is known in-session; session-init's errand sweep carries the broad backstop for errands
  whose PR merged out-of-session.
- **Drop the originating `USER-INBOX` entry** — `arc user inbox-remove <slug>` (matched on the entry title in
  v1; idempotent — a no-op when already gone). This is the single point where that removal is ensured. An errand
  that started but never completed keeps its entry, so the intent is never lost; session-init's in-flight sweep
  backstops an abandoned branch.

**Unattended completion (auto-merge lane).** When the merge lands unattended — after the session has moved on or
ended — these steps do not fire here in-session. They are replayed from base context by the
[same-session finalize pass][finalize-pass] or, next session, by session-init's in-flight-errand sweep. This
section stays the authoritative specification of what completion does; the backstops replay it, and every step
is idempotent — locus removal, ref prune, and the `USER-INBOX` line drop each no-op when their target is already
gone — so the one-authoritative-point-plus-backstops shape never double-fires.

---

[assess-parallel-fit]: ../../../methods/assess-parallel-fit.md
[finalize-pass]: ../session-lifecycle/session-handoff.md#same-session-finalize-pass
[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md
[drain-inbox]: drain-inbox.md
[init-work-unit]: ../work-unit-lifecycle/planning/init-work-unit.md
[promote-errand-to-wu]: ../work-unit-lifecycle/planning/init-work-unit.md#promote-errand-to-work-unit-path
[commit-footer]: ../../../methods/commit-footer.md
[errand-class]: ../../../../reference/strategies/arc/strategy-work-organization.md#errand-work-class
[branch-modes]: ../../../../reference/strategies/arc/strategy-work-organization.md#branch-protection-modes
[auto-lane]: ../../../../reference/strategies/arc/strategy-work-organization.md#auto-merge-lane
