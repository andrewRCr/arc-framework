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
re-enterable through the Errand's exact identity and checkout. A full-mode interruption or review tail retains that
exact identity and checkout without a meta, task list, or SESSION-NOTES; partial mode must complete, promote, or
explicitly abandon in the current session.

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

3. **Open or resume the Errand checkout.**

   - **Launch mode:** invoke `arc errand open <slug> --intent <text> --json`. For an originating
     `USER-INBOX § Errand` capture, add `--from-inbox <entry-title>` or `--inbox-title-file <path>` (`-` reads
     stdin). The verb owns both protection modes: full protection allocates the free primary or a provisioned
     transient and mints the exact v3 identity; partial protection occupies only a safe free primary and creates no
     branch or portable identity. A warm entry never moves the session home or repurposes its WU checkout.
   - **Resume mode:** consume the exact checkout and freshly attached lease selected by session-init. Do not invoke
     `arc errand open` again; residue recovery already ran `arc locus resolve <record-id> --action resume`, and a
     live role already ran `arc locus attach`. A remote-only eligible generation first runs
     `arc errand materialize <slug> --json`; accept only its exact returned generation and path. A recorded head
     that no longer matches the fetched remote or open change request refuses materialization. Open identities,
     legacy branch-only candidates, closed or missing change requests, and partial Errands are not materializable.

   Execute every subsequent command from `activeLocusPath` while retaining `sessionHomePath` for restoration.

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

**Spec-worthy → promote.** If the work crosses a floor mid-execution — it needs design authored, or a durable
cross-session plan — stop and continue through the [Promote Errand path][promote-errand-to-wu]. That path owns the
floor judgment, generation-checked conversion, meta commit, and capture settlement; do not promote inline.

**Explicit abandon.** On explicit direction to discard a safely preserved generation, invoke
`arc errand abandon <slug> --json`. A full identity and its local review tail abandon only when the verb proves
provenance, cleanliness, exact refs, and host disposition. A partial Errand abandons only while its clean primary is
at the freshly pushed base. Both modes retain the originating capture and clear its execute-bound marking; never
simulate abandonment by deleting a branch or session locus record.

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

   > [!CAUTION]
   > `push-interlock` release — `workflowPush`: `-u origin <branch>`.

   Compose the immutable policy target `{ repository, pullRequest: null, headSha }`, the routed `standardReview`
   projection, and explicit review-routing facts. The future merge lane remains downstream presentation, not a
   routing input. For each new target, invoke `arc review chunking resolve -` once; select whole-target or chunked
   scope separately for each role and pass it to `arc review resolve -`.

   Resolve frontline, then the pre-PR standard lane. Follow only the driver's typed `state` / `nextAction`:

   - `skipped | no-op | pass-complete / none` — complete the lane at this boundary.
   - `awaiting-change-request / open-change-request` — retain progress and continue to PR creation.
   - `ready / run-frontline` — invoke `arc review frontline resolve -` and `arc review frontline run -`.
   - `ready / local-prepare` — invoke `arc review local prepare -`; submit evaluator-owned result content through
     `arc review local attest -`, with runtime-owned bindings injected from the immutable operation.
   - `findings / respond` — run [`review-triage`][review-triage] and [`review-response`][review-response], then
     submit approved mutation/commitment decisions through `arc review respond -`.
   - `approval-required / obtain-ceiling-override` — surface the exact one-pass consequence and
     `Approve (or redirect)?`; return only exact approval to the same target/lane call.
   - `chunk-pending / continue-chunks` — continue the local chunk series without consuming the pass.
   - `stale-target / select-scope` — recompose and rerun chunking.
   - `blocked | unavailable | invalid-override / stop` — surface the typed diagnostics and stop.

   Resume local operations with `arc review local resume -` and reduce with `arc review reduce -`. A command error
   envelope carries no action. Approval is required before any finding-driven fix, durable deferral, channel
   settlement, or other mutation/commitment; a complete no-action record-only set may ride to the final combined
   gate. Approved fixes run Tier 1 gates, commit atomically, push, and create a new target. Never carry clearance or
   merge authority.

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
   # Portable: do not combine --slurp with --jq/--template (gh rejects that pairing).
   # Pipe to jq; a failed pipe is a stop (never treat as empty).
   gh api --method GET --paginate --slurp \
     "repos/{repository}/pulls?state=all&base={base-branch}&head={owner}:{branch}&per_page=100" \
     | jq .
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
   numbered actions before review. Both hooks and the review protocol share this exact-head contract. After any
   head-changing action, recompose `openedChangeRequest` from the canonical current head before re-entry.

   Before spending a hosted pass on a branch already behind its base, read `arc base drift --json`. Keep `clean`
   and regenerable-only drift silent. For substantive overlap, reconcile early only when the interaction is clear
   and reviewing first would waste the pass; use an append-only merge, rerun Tier 1 gates, push, and recompose the
   target without a permission stop. A conflict, material interaction, or uncertain product decision stops. This
   advisory never replaces Step 5's authoritative final drift read.

   Rerun `arc review chunking resolve -` for the opened target and invoke `arc review resolve -` for each incomplete
   lane. Follow the Step 2 dispatch. On `ready / hosted-request`, invoke `arc review hosted request -` with the
   selected provider, exact opened target, and `coverage: complete`:

   - `requested / await` — pass the returned self-contained handle to `arc review hosted await -`. Use that bounded
     wait again for `pending / await`; do not build an agent polling loop.
   - `clean / complete` — feed a `clean` attempt to `arc review resolve -`.
   - `findings / triage` — run the disposition protocol. For each approved finding with
     `settlement: reply-and-resolve`, settle before feeding `findings` back to the driver. For `defer` or `reject`,
     invoke `arc review hosted settle -` with the unchanged originating `target` and `fixTarget: null`. For `fix`,
     apply and verify the approved change, commit and push it, recompose the current target, then invoke the same
     verb with the originating `target` plus that changed `fixTarget`. A finding with
     `settlement: not-applicable` is triage-only: never invoke `hosted settle`, post a reply or compensating summary
     comment, or resolve anything for it, regardless of disposition.
   - `rate-limited | transient-unavailable / try-next-source` — feed that safe outcome to the same driver call; it
     may select the next configured source without consuming the pass.
   - Any ambiguous delivery, stale target, malformed output, source failure, or terminal failure stops. Never replay
     an uncertain request.

   On interruption, retain the returned operation ID and follow the last typed `state` / `nextAction`. Resume a
   suspended local operation with `arc review local resume -`; re-invoke the owning idempotent verb for frontline,
   hosted await, response, settlement, or reduction. Never reconstruct review state from workflow prose or invent
   WU state: the Errand branch, PR, and public operation references are sufficient continuity.

   After every target movement, make and disclose a **review applicability** judgment from the exact delta. Use
   targeted verification when prior complete coverage confidently remains applicable to a narrow non-interacting
   record-only or lifecycle delta; use a focused supplemental check for a bounded interaction; repeat complete
   review for behavioral, authority, contract, materially interacting, or uncertain change. A confident bounded
   choice proceeds without a permission stop. An agent-selected supplemental review is disclosed as it runs and
   enters the same disposition loop. A hosted supplemental request uses `coverage: incremental`; if its adapter
   reports `effectiveCoverage: complete`, accept the broader review and disclose the upgrade. Stop only for new
   authority, material cost, or genuine uncertainty.

   Re-run Tier 1 gates after every review-driven change. A new target invalidates clearance and integration
   authority. After the routed review settles, run `arc review planning-lane <base-sha> <head-sha>` over the exact
   PR delta. Only literal `planning` is eligible for the **auto-merge-lane**; `reviewed` selects the
   **reviewed-lane**, while command failure or malformed output stops. Then apply the judgment-only threshold from
   [§ Auto-Merge Lane][auto-lane]: foreign ownership or another confidently recognized review condition may move
   an eligible change to reviewed without a permission stop, but never the reverse. The merge lane is downstream
   presentation only and cannot change routing, response, or evidence authority.

5. **Settle the final head.** Establish `vehicle: errand` from the strict Errand record, branch, and exact PR. That
   vehicle is explicitly outside WU composition-product requirements. **Never infer the exemption from absent or
   malformed WU state** · `[invariant]`; a missing or contradictory Errand identity stops.

   Run authoritative base freshness and validate the complete typed result:

   ```bash
   arc base drift --json
   ```

   After any fix, request action, or append-only base reconcile changes the head, execute the generic push contract,
   rerun chunking, and return through Step 4's review applicability judgment. Use targeted verification only when
   prior complete coverage confidently remains applicable; otherwise run focused or complete review. Repeat until
   base, head, requirements, and review are settled.

   Compose the final `openedChangeRequest` and fire `pre-merge`.
   Compose and preview the content-gated `## Review` record from the settled review cycle: `Local`, `Hosted PR`,
   `Triage`, and, when prior complete coverage carried across a narrow delta, `Coverage`. Omit the whole section
   when no review ran; omit `Coverage` when every reported pass ran on the final head.

   Then retain `openedChangeRequest.headSha` as `{approved-head-sha}`. No review-authored commit or push may occur
   after this stable checkpoint.

   - **Extensions** · `#pre-merge`: If active, run its `.actions` before the merge; halt-on-fail as above.
     Otherwise skip.

> [!IMPORTANT]
> `integration-interlock`: Stop after the current head is settled and before arming auto-merge or releasing the
> reviewed lane. Surface the exact head, review applicability calls and targeted verification, proposed final
> dispositions and `## Review` record, PR checks, required approvals, base freshness, and the resolved lane. State
> that approval applies final dispositions and channel settlement, ends review, invokes exact-head unlock only for
> the reviewed lane, and authorizes the lane action only if ordinary exact-head rechecks succeed unchanged. Close
> with `Approve (or redirect)?`.

Immediately after approval, apply approved final dispositions and channel settlements, then recompose the exact
current head and re-read PR status and requirements. A changed head or unsettled requirement invalidates approval
and returns to Step 4. Replace any stale PR review summary with the previewed `## Review` record. With the approved
head still exact, permit no review action, lifecycle mutation, commit, push, fetch, or second human stop before the
lane action.

6. Land per lane:

   Immediately before either lane action, invoke `arc base drift --json` once more. Only authoritative `clean`
   continues; `reconcile` returns to Step 5 and requires a new exact-head checkpoint and approval, while unavailable
   or malformed output stops.

   **Auto-merge-lane** — re-read the PR's exact base SHA and rerun the canonical classifier immediately before
   arming. Only literal `planning` preserves this lane; `reviewed` returns to Step 5 as reviewed-lane, while command
   failure or malformed output stops. Then resolve `merge.strategy` via the config probe and arm native auto-merge
   with the matching method (`merge` → `--merge`, `squash` → `--squash`, `rebase` → `--rebase`):

   ```bash
   arc review planning-lane <base-sha> {approved-head-sha}
   arc config status --json   # read settings["merge.strategy"]
   gh pr merge <pr-number> --auto <merge-flag> --match-head-commit {approved-head-sha}
   ```

   **Reviewed-lane** — invoke `arc review unlock -` for the exact approved target. Follow only its typed action:
   `dispatched / await-clearance` waits for the required `arc-cleared` status; `no-unlock / none` continues because
   the default-branch workflow is absent; `blocked / stop` invalidates approval. Re-read the required checks on the
   unchanged head, then leave the PR open for owner review on `{approved-head-sha}`. A head change restarts Step 4;
   native owner approval satisfies its own requirement but never replaces the integration-interlock.

   The auto-merge lane invokes no unlock: when the optional guard is installed, its trusted CI poster supplies
   `arc-cleared`; otherwise no such context is required.

7. **Leave the local checkout when review continues asynchronously.** After the exact PR head is pushed and the
   change request is open, invoke `arc errand leave <slug> --state awaiting-merge --json`. The driver persists the
   exact change request and head, closes local occupancy, and restores the optional parent WU. If work is
   deliberately interrupted before PR creation, commit and push the checkpoint first, then use `--state paused`.
   Partial mode and unpushed or unproven heads refuse. Requested work later resumes through the identity's owning
   open or materialize driver; never leave an unleased local role as waiting state.

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
`parentCheckoutPath`). On acceptance, enter from `parentCheckoutPath` when non-null, otherwise from the returned
between-WUs frame; derive and confirm a branch-safe `<slug>` for `nextOffer.key`, then invoke
`arc errand open <slug> --from-inbox <nextOffer.key> --json`. Consume the open result as the new sibling locus. On
decline, return to the restored parent/between-WUs frame. Never scan the inbox for a replacement continuation.

**Unattended merge (auto-merge lane).** If the merge lands after the session ends, `arc errand close` is replayed
from the retained checkout by the [finalize pass][finalize-pass] or the next session. Exact replay is idempotent
and may return the next file-ordered execute-bound offer.

---

[assess-parallel-fit]: ../../../methods/assess-parallel-fit.md
[finalize-pass]: ../session-lifecycle/session-handoff.md#same-session-finalize-pass
[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md
[drain-inbox]: drain-inbox.md
[init-work-unit]: ../work-unit-lifecycle/planning/init-work-unit.md
[promote-errand-to-wu]: ../work-unit-lifecycle/planning/init-work-unit.md#promote-errand-to-work-unit-path
[commit-footer]: ../../../methods/commit-footer.md
[review-response]: ../../../methods/review-response.md
[review-triage]: ../../../methods/review-triage.md
[errand-class]: ../../../../reference/strategies/arc/strategy-work-organization.md#errand-work-class
[auto-lane]: ../../../../reference/strategies/arc/strategy-work-organization.md#auto-merge-lane
