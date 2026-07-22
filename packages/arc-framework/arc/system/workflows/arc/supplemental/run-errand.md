---
purpose: Execute an out-of-work-unit errand end to end as a re-enterable Launch → Execute → Integrate lifecycle dispatched by arc-session — one atomic concern, single session, no task list.
audience: agent
arc:
  methods:
    - assess-parallel-fit
    - commit-footer
    - frontline-review
    - independent-analysis
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
re-enterable through the Errand's exact identity and checkout. A full-mode pause or review tail retains portable
identity without a meta, task list, or SESSION-NOTES; partial mode must complete, promote, or explicitly abandon in
the current session.

Every state-touching Errand command uses `--json`. On `applied` / `idempotent`, render `recommendedPromptText` and
consume returned paths, record/lease IDs, restored parent, origin back-pointer, and `nextOffer`; on `refused` or
`error`, render the supplied text and stop. Never reconstruct allocation, preservation, cleanup, or continuation
from Git branch shape.

When the rendered text asks for directed-command confirmation, confirm that the current session can run subsequent
commands at `activeLocusPath`. If it cannot or the capability is uncertain, recommend a cold session at that
checkout and stop before execution.

## Launch

Confirm the work is an Errand, check for in-flight overlap, then open or resume its allocated checkout.

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

3. **Open or resume the Errand checkout.** Invoke `arc errand open <slug> --intent <text> --json`. For an originating
   `USER-INBOX § Errand` capture, add `--from-inbox <entry-title>` or `--inbox-title-file <path>` (`-` reads stdin).
   The verb owns both protection modes: full protection allocates the free primary or a provisioned transient and
   mints/resumes the exact v3 identity; partial protection occupies only a safe free primary and creates no branch
   or portable identity. A warm entry never moves the session home or repurposes its WU checkout. Execute every
   subsequent command from returned `activeLocusPath` while retaining `sessionHomePath` for restoration.

   **Resume/materialize.** A local paused identity or awaiting-merge identity with an open change request resumes
   through the same `arc errand open` driver. A remote-only eligible generation first runs
   `arc errand materialize <slug> --json`; accept only its exact returned generation/path. Head drift resumes the
   recorded head with a warning; when host truth is unreachable, confirm the change request remains open before
   execution. Open identities, legacy branch-only candidates, closed or missing change requests, rewritten-away
   recorded heads, and partial Errands are not materializable.

4. **Late inbox adoption, when needed.** If an in-flight ordinary full-mode Errand acquires a matching capture
   after open, run `arc errand link <slug> --from-inbox <entry-title> --json` (or `--inbox-title-file`). It may add
   only one exact origin back-pointer to an otherwise linkable v3 claim. Conflicts, legacy records, missing
   captures, and partial mode refuse; never edit the identity or inbox by hand.

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

**Spec-worthy → promote.** If work crosses the wrapper floor, stop and confirm the judgment, then invoke
`arc errand promote <slug> --floor derivation|scale --json`. The verb requires the exact committed full-mode
generation and performs the generation-checked branch/meta/marker/role replacement; for a warm promotion it also
releases the former parent WU lease and makes the promoted checkout the sole session home. Render its result and
continue only from the returned WU checkout. Commit the minted meta through the work-unit ceremony before removing an
originating inbox capture; then run `arc user inbox-remove` with the returned `originEntry`. If the meta commit or
capture removal fails, preserve the evidence and stop. Partial mode cannot use this full-mode verb and must first
take the WU initialization route chosen by the owning lifecycle.

**Explicit abandon.** On explicit direction to discard a safely preserved generation, invoke
`arc errand abandon <slug> --json`. Open/paused full identities and closed-unmerged review tails abandon only when
the verb proves provenance, cleanliness, exact refs, and host disposition. A partial Errand abandons only while its
clean primary is at the freshly pushed base. Both modes retain the originating capture and clear its execute-bound
marking; never simulate abandonment by deleting a branch or session locus record.

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
   `"invocation": {"mode": "inherit"}`, then execute only its selected action:

   - `skip` — continue.
   - `offer` — surface its preparation or authorization action; execute only when accepted and the carrier is ready.
   - `attempt` — prepare the registered source and run [`frontline-review`][frontline-review] against the exact
     target.

   Resolve `frontline-run` through `ReviewOperationStateStore` before execution. Reuse only an unchanged exact
   target/source/policy/generation binding; otherwise invalidate it. Publish pending state before the carrier effect
   and the normalized outcome after it. This operational record never enters review receipts or gate reduction.

   Route normalized findings through [`review-response`][review-response]. Apply only the approved fix set, run Tier
   1 quality gates, commit through the applicable interlock, and push through the Errand push contract. After every
   persisted fix, recompose the exact target and resolve frontline routing again; run only the bounded follow-up the
   result permits. Surface clean, unavailable, failed, and pass-cap outcomes as advisory publication orientation,
   then continue without treating them as review evidence.

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
   numbered actions before review coordination. Derive current controller/PR state from `hostRef`. Review
   coordination and both hooks share this exact-head contract. After any head-changing action, recompose
   `openedChangeRequest` from the canonical current head before re-entry.

   Invoke the active project review coordinator's source-neutral independent-analysis cycle with the exact target,
   effective routed obligation, and explicit project channel `local | hosted | both`. The coordinator selects and
   normalizes the admitted carrier, reduces its result, and sends findings through [`review-response`][review-response].
   If the selected source is unavailable, partial, or failed, only a required obligation blocks; recommended work
   stays visible and non-blocking. Recompose and repeat the cycle after any approved fix changes the target.

   When the cycle suspends, publish the strict `review-suspension` through the vehicle-neutral response-state store
   with `vehicle: errand`, exact target/request, source/policy, deadline, generation, and wakeup token. Re-entry reads
   current host/provider state and follows the shared promoted watcher → bounded schedule → explicit human re-entry
   hierarchy. Never invent WU meta or task-list state from absent or malformed WU state; the Errand branch, PR, and
   operation record are sufficient continuity.

   After the shared cycle settles, classify the merge lane by what the Errand touched ([§ Auto-Merge Lane][auto-lane]):
   code uses the **reviewed-lane**; pure planning or doc grooming may use the **auto-merge-lane**. This merge lane is
   downstream presentation only and cannot change routing, response, or evidence authority.

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

7. **Leave the local checkout when review continues asynchronously.** After the exact PR head is pushed and the
   change request is open, invoke `arc errand leave <slug> --state awaiting-merge --json`. The driver persists the
   exact change request/head, returns or tears down the local checkout, pops its role/lease, and restores the optional
   parent WU. If work is deliberately interrupted before PR creation, commit and push WIP first, then use
   `--state paused`. Partial mode and unpushed/unproven heads refuse. Requested work later resumes through the
   identity's `resume` action and owning open/materialize driver; never leave an unleased local role as waiting
   state.

### Ship — partial protection

No branch and no PR: the Errand is a direct base-branch commit, so there is no merge step. The base push follows
the project's normal discipline. It cannot pause, await merge, materialize, or hand off; completion must pop the
exact partial role and remove any originating capture before the session can leave.

### Complete

On merge (full) or final commit (partial), invoke `arc errand close <slug> --json` and consume its typed result.

- **Full protection** — the verb proves merge/preservation, finalizes the exact v3 identity tail, reaps refs and
  any retained checkout safely, and drops only its origin capture. The bounded v1/v2 compatibility arm may close an
  already-open legacy record once; `--force` is legacy-only and never bypasses v3 preservation/host checks.
- **Partial protection** — the completion arm verifies the direct-base result, pops the exact partial role, and
  removes its origin capture through the inbox mutation boundary. It creates no branch, PR, or portable identity.

When the result carries `nextOffer`, offer only that exact file-ordered execute-bound sibling (`kind`, `key`, and
`parentCheckoutPath`). On acceptance, re-enter this workflow through the sibling's open driver; on decline,
return to the restored parent/between-WUs frame. Never scan the inbox for a replacement continuation.

**Unattended merge (auto-merge lane).** If the merge lands after local leave, `arc errand close` is replayed from
base context by the [finalize pass][finalize-pass] or the identity's session-init `finalize` action. Exact replay is
idempotent and may return the next file-ordered execute-bound offer.

---

[assess-parallel-fit]: ../../../methods/assess-parallel-fit.md
[finalize-pass]: ../session-lifecycle/session-handoff.md#same-session-finalize-pass
[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md
[drain-inbox]: drain-inbox.md
[init-work-unit]: ../work-unit-lifecycle/planning/init-work-unit.md
[commit-footer]: ../../../methods/commit-footer.md
[frontline-review]: ../../../methods/frontline-review.md
[review-response]: ../../../methods/review-response.md
[errand-class]: ../../../../reference/strategies/arc/strategy-work-organization.md#errand-work-class
[auto-lane]: ../../../../reference/strategies/arc/strategy-work-organization.md#auto-merge-lane
