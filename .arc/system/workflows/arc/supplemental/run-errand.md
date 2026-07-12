---
purpose: Execute an out-of-work-unit errand end to end as a re-enterable Launch → Execute → Integrate lifecycle dispatched by arc-session — one atomic concern, single session, no task list.
audience: agent
arc:
  methods:
    - assess-parallel-fit
    - commit-footer
  extensions:
    - post-task-quality
    - pre-pr-open
    - post-pr-open
    - pre-push-review
    - pre-merge
---

# Workflow: Run Errand

Execution body for an **errand** — a single **atomic** concern (one indivisible unit of work, bounded to one
session) — entered warm from an active session via the `arc-errand` skill, cold via `arc-session` (`--errand`, or
adopted from session-init's discovery arm), or from a [`drain-inbox`][drain-inbox] hand-off. For the
errand-vs-work-unit boundary, see [§ Errand Work Class][errand-class].

**Typically one review increment, often one commit** — but neither bounds the character: a determinate sweep may
land in several commits, and a large one may be reviewed in a bounded few **in-session** passes (an *extended
errand*), each its own gate. No task list, no `process-task-loop`. The phases — Launch → Execute → Integrate — are
**re-enterable**: pausing is `commit WIP + push`; a paused errand resumes from its pushed branch and originating
capture, with no SESSION-NOTES.

## Launch

Confirm the work is an errand, check for in-flight overlap, and relocate off the launch branch — so the errand
never executes from an unrelated work unit's branch.

1. **Classify — errand vs. work unit.** Confirm the work is a single **self-evident** concern that fits one
   session. The work-unit tell is **spec-worthiness**: design worth recording, or a determinate concern large
   enough to need a durable cross-session plan — route those through [`init-work-unit`][init-work-unit]. A
   determinate sweep stays an errand however many commits, or in-session passes, it takes. (Scope that *crosses a
   floor* mid-execution is handled by Execute's promote primer.) See [§ Errand Work Class][errand-class] for the
   boundary.

2. **Check for foreign overlap — apply [`assess-parallel-fit`][assess-parallel-fit] (overlap read only).** Run the
   overlap check against the paths the errand will touch:

   ```bash
   arc errand check --target <path>... --json
   ```

   It emits `{overlaps, reachable}` — which in-flight work units touch the same paths, across worktrees and
   machines, fresher here than at capture. Apply the method's overlap read (the rubric and the all-owner gate:
   foreign-owned → coordinate); an errand has no design stage, so the design-load read does not apply. **Advisory,
   never a gate:** surface any overlap, coordinate or sequence after the other unit integrates, then proceed. If
   the remote is unreachable the check degrades to local refs and says so.

3. **Open the errand locus** — relocate per protection mode ([§ Branch Protection Modes][branch-modes]):

   - **Full protection** — `arc errand open <slug>` cuts the errand branch and occupies it in place (`--type
     fix|chore|refactor|hotfix`, default `chore`; `--intent <text>` for the concern). When the errand adopts an
     originating `USER-INBOX § Errand` capture, add `--from-inbox <entry-title>` — the record is minted
     `inbox`-origin and `arc errand close` drops that capture instead of orphaning it. `<slug>` is branch-safe
     (lowercase/digits/hyphens) and is the merge key; idempotent — re-running reuses an existing branch.
   - **Partial protection** — no branch (`open` refuses here): read `arc housekeep check --json` → `baseBranch` /
     `primaryWorktreePath`, switch to that base checkout, and commit directly to base (a documented off-work-unit
     maintenance exception).

## Execute

Honor the [Review-Increment Invariant][dev-rules-arc]: each review increment's change **accumulates uncommitted**,
is **reviewed once at its gate**, and is committed only **after** approval — never commit-then-review.

**Most errands are one pass.** Make the change, run the project's Tier 1 quality gates on what you touched, gate,
and commit.

**Extended errand (the exception).** A *determinate* concern too large to review in one window may be staged into
a **bounded few in-session passes** — but only when it crosses **neither floor** (no design to author, no durable
cross-session plan). Propose the split and get approval first ("this is ~N passes — gate at each?"); then run each
pass as its own increment, tracked in-session only, never a task list. Staging review for ergonomics is not a
work-unit signal; needing a *durable plan* is.

**Spec-worthy → promote.** If the work crosses a floor mid-execution — it needs design authored, or a durable
cross-session plan — stop and promote via the [Promote Errand path][promote-errand-to-wu] (`arc errand promote
<slug> --floor derivation|scale`: rename → meta at the floor's stage → record retired, commits preserved), then
continue under the work-unit lifecycle.

Run each review increment (one for a typical errand; a few for an extended one):

1. **Build** the change and run Tier 1 quality gates on what you touched.

   - **Extensions** · `#post-task-quality`: If `post-task-quality` is active, run its `.actions`. Otherwise skip.

   > [!IMPORTANT]
   > `workflow-interlock`: Stop after the change is complete and its gates pass. Surface the diff and verification
   > status; await approval before committing. For the final increment, approval also releases into Integrate.

2. **Commit** on approval — the change carries a `standalone (...)` context footer (no work unit owns it):

   > [!CAUTION]
   > `commit-interlock` release — commit as `taskCommit` (the gate above precedes the commit; a determinate
   > increment that spans several commits releases them together):

   ```text
   <type>(<scope>): <errand summary>

   Context: standalone (<kind>)
   ```

   See the [`commit-footer` method][commit-footer] for the `standalone (...)` parenthetical set.

## Integrate

The errand's commits are made; now ship and clean up. Integrate branches on protection mode.

### Ship — full protection

1. **Classify the merge lane** by what the errand touched ([§ Auto-Merge Lane][auto-lane]): a code errand is
   **reviewed-lane** and ships on its own PR; a pure planning- or doc-grooming errand may be **auto-merge-lane**.

2. **Push** the errand branch upstream.

   - **Extensions** · `#pre-push-review`: If active, run its `.actions` before the push; halt-on-fail surfaces an
     actionable message, fix-and-retry or explicit-invoke bypasses. Otherwise skip.

   > [!CAUTION]
   > `push-interlock` release — `workflowPush`: `-u origin <branch>`.

3. **Resolve the Errand PR** before creation. Paginate the exact current repository + head-owner/branch query and
   retain each candidate's state, merged time, and head SHA. A lookup error or incomplete enumeration is a stop, not
   an empty result. Classify the complete result:

   | Result                                                           | Action                                       |
   |------------------------------------------------------------------|----------------------------------------------|
   | No match                                                         | Enter the creation arm below                 |
   | One open match                                                   | Reuse its `hostRef`; do not create or reopen |
   | One merged match at the current head                             | Skip review/merge and enter Complete cleanup |
   | Closed-unmerged, stale merged head, multiple/conflicting matches | Stop and surface every candidate             |

   ```bash
   gh api --method GET --paginate --slurp \
     "repos/{repository}/pulls?state=all&base={base-branch}&head={owner}:{branch}&per_page=100"
   ```

   The no-match creation arm uses a **lean errand body** — `template-pull-request` assumes a work unit, so inline a
   one-line Summary plus a one-line Test Plan only when verification is non-obvious. No Spec / Out-of-Scope /
   Follow-Up sections.

   Compose `proposedChangeRequest = { repositoryRef, baseRef, headRef, headSha }`. If `pre-pr-open` is active,
   execute numbered actions in authored order immediately before creation; halt before later actions on failure.
   Retry these retry-safe actions after a failed create, but never run them on the one-open-match reuse path.

   Immediately before `gh pr create`, read `refs/heads/<branch>` from the base repository remote with
   `git ls-remote --heads origin`. Compare its exact 40-hex SHA with `proposedChangeRequest.headSha`; on absence,
   ambiguity, or mismatch, stop and restart PR resolution. Never create against a head that changed after validation.

   ```bash
   gh pr create --base <base-branch> --head <branch>
   ```

4. **Enter the open PR.** On both newly-created and reused-open paths, compose
   `openedChangeRequest = { repositoryRef, hostRef, headSha }`. If `post-pr-open` is active, execute its idempotent
   numbered actions before review coordination. Derive current controller/PR state from `hostRef`.

5. **Settle the final head.** For reviewed and auto lanes, run review coordination and fire `pre-merge` before
   merge authorization. If any fix/request action changes the head, repeat base freshness, current-head coordination,
   and the final hook until the head is unchanged and the controller reports it settled. No review-authored commit or
   push may occur after the stable checkpoint.

   - **Extensions** · `#pre-merge`: If active, run its `.actions` before the merge; halt-on-fail as above.
     Otherwise skip.

> [!IMPORTANT]
> `integration-interlock`: Stop after the current head is settled and before arming auto-merge or merging. Surface PR
> status (checks, required approvals) and the resolved lane; await explicit integration approval — never infer it from
> the increment approval above.

6. Land per lane:

   **Auto-merge-lane** — resolve `merge.strategy` via the config probe, then arm native auto-merge with the
   matching method (`merge` → `--merge`, `squash` → `--squash`, `rebase` → `--rebase`):

   ```bash
   arc config status --json   # read settings["merge.strategy"]
   gh pr merge <pr-number> --auto <merge-flag>
   ```

   **Reviewed-lane** — leave the PR open for owner review; it merges on approval.

### Ship — partial protection

No branch and no PR: the errand is already a direct base-branch commit, so there is no merge step. The base push
follows the project's normal base-push discipline.

### Complete

On merge (full) or final commit (partial), close out:

- **Full protection** — `arc errand close <slug>` reaps the branch, deletes its remote head when the work
  provably landed in base (a host's delete-on-merge having already removed it is the idempotent no-op), prunes
  its tracking ref, removes the record, and drops the originating `USER-INBOX` capture (the entry its record
  back-points to). The reap is containment-safe: if the branch's commits aren't provably preserved (pushed or
  merged), it **refuses** and keeps the record — push/merge then retry, or `--force` if you've verified it
  shipped. A remote head that is the only proven preservation (e.g. a multi-commit squash) is kept and surfaced,
  never deleted. The remote delete is best-effort: on a push failure (auth, connectivity) the local close still
  completes and the head is surfaced for manual cleanup.
- **Partial protection** — nothing to close; the errand is already a direct base commit.

**Unattended merge (auto-merge lane).** If the merge lands after the session ends, `arc errand close` is replayed
from base context by the [finalize pass][finalize-pass] or next session-init's errand sweep — idempotent, so it
never double-fires.

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
