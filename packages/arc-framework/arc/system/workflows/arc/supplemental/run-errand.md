---
purpose: Execute an out-of-work-unit errand end to end as a re-enterable Launch → Execute → Integrate lifecycle dispatched by arc-session — one atomic concern, single session, no task list.
audience: agent
arc:
  methods:
    - assess-parallel-fit
    - commit-footer
    - frontline-review
    - standard-review
    - implementation-audit
    - review-triage
    - review-response
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
land in several commits, and a large one may be reviewed in a bounded few **in-session** passes (an _extended
errand_), each its own gate. No task list, no `process-task-loop`. The phases — Launch → Execute → Integrate — are
**re-enterable**: pausing is `commit WIP + push`; a paused errand resumes from its pushed branch and originating
capture, with no SESSION-NOTES.

## Launch

Confirm the work is an errand, check for in-flight overlap, and relocate off the launch branch — so the errand
never executes from an unrelated work unit's branch.

1. **Classify — errand vs. work unit.** Confirm the work is a single **self-evident** concern that fits one
   session. The work-unit tell is **spec-worthiness**: design worth recording, or a determinate concern large
   enough to need a durable cross-session plan — route those through [`init-work-unit`][init-work-unit]. A
   determinate sweep stays an errand however many commits, or in-session passes, it takes. (Scope that _crosses a
   floor_ mid-execution is handled by Execute's promote primer.) See [§ Errand Work Class][errand-class] for the
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
     originating `USER-INBOX § Errand` capture, add `--from-inbox <entry-title>` — or
     `--inbox-entry-file <path>` (`-` reads stdin) when the exact title contains Markdown or shell
     metacharacters. The record is minted `inbox`-origin and `arc errand close` drops that capture instead of
     orphaning it. `<slug>` is branch-safe (lowercase/digits/hyphens) and is the merge key; idempotent — re-running
     reuses an existing branch.
   - **Partial protection** — no branch (`open` refuses here): read `arc housekeep check --json` → `baseBranch` /
     `primaryWorktreePath`, switch to that base checkout, and commit directly to base (a documented off-work-unit
     maintenance exception).

## Execute

Honor the [Review-Increment Invariant][dev-rules-arc]: each review increment's change **accumulates uncommitted**,
is **reviewed once at its gate**, and is committed only **after** approval — never commit-then-review.

**Most errands are one pass.** Make the change, run the project's Tier 1 quality gates on what you touched, gate,
and commit.

**Extended errand (the exception).** A _determinate_ concern too large to review in one window may be staged into
a **bounded few in-session passes** — but only when it crosses **neither floor** (no design to author, no durable
cross-session plan). Propose the split and get approval first ("this is ~N passes — gate at each?"); then run each
pass as its own increment, tracked in-session only, never a task list. Staging review for ergonomics is not a
work-unit signal; needing a _durable plan_ is.

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

1. **Compose Errand review facts.** Atomic determinacy is a routing fact alongside the canonical change facts and
   `vehicle: errand`; it can scale the obligation only through registered policy. Do not select a merge lane yet.

2. **Push** the errand branch upstream.

   - **Extensions** · `#pre-push-review`: If active, run its `.actions` before the push; halt-on-fail surfaces an
     actionable message, fix-and-retry or explicit-invoke bypasses. Otherwise skip.

   On re-entry with an existing `openedChangeRequest`, invoke the active project review coordinator's exact-head
   mutability action with that change request, the outgoing local head, and any `begin-fix` authorization receipt.
   Stop on any typed refusal. The initial pre-PR push has no `openedChangeRequest` and skips this query.

   > [!CAUTION]
   > `push-interlock` release — `workflowPush`: `-u origin <branch>`.

   From the pushed branch, compose the exact aggregate review target and the explicit routing-facts record the
   resolver consumes — `changeSetState`, `contentKind`, `reviewRisk`, `changeDeterminacy`, `ownership`,
   `surfaceAuthority`, `assurance`, and `activity`. These are review-policy facts, not the canonical changed-path
   record; supplying the latter resolves `changeSetState: unknown` and the maximal floor. The future merge lane is
   downstream presentation, not a routing input. Run `arc review frontline resolve -` with
   `"invocation": {"mode": "inherit"}`. Follow only its typed `state` / `nextAction` pair:

   - `skipped / none` — continue.
   - `offered / bind-source` — surface the unbound source action and stop this lane.
   - `offered / obtain-authorization` — surface the authorization action; re-run resolve only after authorization.
   - `ready / run-frontline` — pass the exact target and complete ready resolution to
     `arc review frontline run -`.

   Dispatch the `frontline run` result by its typed `state` / `nextAction`. Continue on `clean / none`; retry only
   `unavailable / retry`, `timed-out / retry`, or `failed / retry`; repair only an explicit `operator-repair` action;
   recompose the target on `stale-target / prepare-current-target`. On `findings / respond`, run
   [`review-response`][review-response], then pass the durable frontline outcome reference and approved disposition
   set to `arc review respond -`.

   When standard-review dispatch selects the delegated local lane, invoke `arc review local prepare -` with the
   evaluator identity and routing facts. For `local prepare`, supply only `contentKind`, `reviewRisk`,
   `changeDeterminacy`, `ownership`, and `surfaceAuthority`; the CLI derives `changeSetState`, assurance, and
   activity. Follow only its typed `state` / `nextAction`:

   - `exempt / none` — continue.
   - `ready / launch-review` — give the returned reviewer payload to the separately authorized evaluator, then
     submit its normalized result with the returned operation ID to `arc review local attest -`.
   - `unavailable / operator-repair` — stop and surface the binding diagnostics.
   - `stale-target / prepare-current-target` — recompose and restart preparation.

   Dispatch attestation by its typed action: run `arc review reduce -` on `attested-current / reduce`; recompose on
   `stale-target / prepare-current-target`; rerun the review on `expired / rerun-review` or
   `not-attestable / rerun-review`. After an interruption, invoke `arc review local resume -` with the operation ID
   and follow its returned action rather than reconstructing state. On `respond-to-findings / respond`, run
   [`review-response`][review-response] and persist the approved receipt-bound dispositions with
   `arc review respond -`.

   Dispatch `respond` by its typed pair: on `ready-to-fix / apply-fix`, apply only the approved fix set, run Tier 1
   quality gates, commit through the applicable interlock, push through the Errand push contract, then recompose the
   exact target and restart the selected review lane; on `settled / reduce` or `already-settled / reduce`, invoke
   `arc review reduce -`; on `stale-target / prepare-current-target`, recompose the target. Dispatch `reduce` the same
   way: route `findings / respond` through [`review-response`][review-response] and `respond`; continue on
   `settled / none` or `advisory-complete / none`; invoke the returned retry command on `retryable / retry`;
   recompose on `stale-target / prepare-current-target`.

   Any command error envelope, including `invalid-input`, stops the lane and carries no dispatchable state. Never
   treat advisory receipts, outcomes, or reductions as merge authority.

3. **Resolve the Errand PR** before creation. Paginate the exact current repository + head-owner/branch query and
   retain each candidate's state, merged time, and head SHA. A lookup error or incomplete enumeration is a stop, not
   an empty result. Classify the complete result:

   | Result                                                           | Action                                       |
   | ---------------------------------------------------------------- | -------------------------------------------- |
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
   numbered actions before review coordination. Derive current controller/PR state from `hostRef`. Review
   coordination and both hooks share this exact-head contract. After any head-changing action, recompose
   `openedChangeRequest` from the canonical current head before re-entry.

   Re-enter the public `arc review` protocol with the exact target, effective routed obligation, and explicit project
   channel `local | hosted | both`. An active project review coordinator may select a source and supply hosted-only
   adapter actions, but it drives local and frontline transitions only through those commands. Follow the returned
   typed state/action through reduction and send findings through [`review-response`][review-response]. If the
   selected source is unavailable, partial, or failed, only a required obligation blocks; recommended work stays
   visible and non-blocking. Recompose and repeat the protocol after any approved fix changes the target.

   On interruption, follow the last typed `state` / `nextAction` and retain the returned operation ID. Resume a
   suspended local operation with `arc review local resume -`, and re-invoke the owning idempotent verb for frontline,
   response, or reduction work. Hosted-only waits remain behind the active project coordinator. Never publish or
   reconstruct review state from workflow prose. Never invent WU meta or task-list state from absent or malformed WU
   state; the Errand branch, PR, and public operation references are sufficient continuity.

   After the public protocol settles, classify the merge lane by what the Errand touched
   ([§ Auto-Merge Lane][auto-lane]): code uses the **reviewed-lane**; pure planning or doc grooming may use the
   **auto-merge-lane**. This merge lane is downstream presentation only and cannot change routing, response, or
   evidence authority.

5. **Settle the final head.** Establish `vehicle: errand` from the strict Errand record, branch, and exact PR. That
   vehicle is explicitly outside WU composition-product requirements. Never infer the exemption from absent or
   malformed WU state; a missing or contradictory Errand identity stops.

   Run authoritative base freshness and validate the complete typed result:

   ```bash
   arc base drift --json
   ```

   After any fix, request action, or append-only base reconcile changes the head, execute the generic push contract
   and return to current-head coordination. The coordinator applies typed applicability: `carry` is admissible only
   when the prior exact scope remains unchanged; otherwise retrigger the routed obligation. Repeat until base, head,
   requirements, and review are settled.

   Compose the final `openedChangeRequest` and fire `pre-merge`.
   Then retain `openedChangeRequest.headSha` as `{approved-head-sha}`. No review-authored commit or push may occur
   after this stable checkpoint.

   - **Extensions** · `#pre-merge`: If active, run its `.actions` before the merge; halt-on-fail as above.
     Otherwise skip.

> [!IMPORTANT]
> `integration-interlock`: Stop after the current head is settled and before arming auto-merge or merging. Surface PR
> status (exact head, checks, required approvals, base freshness) and the resolved lane; await explicit integration
> approval — never infer it from the increment approval above.

Immediately after approval, recompose the exact current head and re-read PR status, requirements, and authoritative
base drift. A changed head, unsettled requirement, or non-clean base invalidates approval and returns to Step 4. With
the approved head still exact, permit no review action, lifecycle mutation, commit, push, fetch, or human stop before
the lane action.

6. Land per lane:

   **Auto-merge-lane** — resolve `merge.strategy` via the config probe, then arm native auto-merge with the
   matching method (`merge` → `--merge`, `squash` → `--squash`, `rebase` → `--rebase`):

   ```bash
   arc config status --json   # read settings["merge.strategy"]
   gh pr merge <pr-number> --auto <merge-flag> --match-head-commit {approved-head-sha}
   ```

   **Reviewed-lane** — leave the PR open for owner review on `{approved-head-sha}`. A head change restarts Step 4;
   native owner approval satisfies its own requirement but never replaces the integration-interlock.

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
[review-response]: ../../../methods/review-response.md
[errand-class]: ../../../../reference/strategies/arc/strategy-work-organization.md#errand-work-class
[branch-modes]: ../../../../reference/strategies/arc/strategy-work-organization.md#branch-protection-modes
[auto-lane]: ../../../../reference/strategies/arc/strategy-work-organization.md#auto-merge-lane
