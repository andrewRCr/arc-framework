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

Every state-touching Errand command uses `--json`. For `open` / `materialize`, consume `operation`, `subject`, the
non-null `allocation` and its exact `checkoutPath`, optional `parentCheckoutPath`, identity/origin settlement
evidence, `nextOffer`, and `recommendedPromptText`. For `link`, require `allocation: null`, no parent checkout, and
consume the exact updated subject and identity/origin evidence. For terminal `close` / `abandon` / `leave` results:

- On `applied` / `idempotent`, consume `operation`, `subject`, `generation`, `checkoutPath`,
  `parentCheckoutPath`, `settlement`, `nextOffer`, and `recommendedPromptText`. Only an `idempotent` result proving
  terminal absence may carry null `subject` and `generation`; evidence-bearing results carry both exactly.
- On `confirmation-required`, bind the named `operation`, exact `subject`, `generation`, `checkoutPath`, and
  `destructiveEffect`; surface the effect and the retry command from `recommendedPromptText`, then stop. On explicit
  approval, invoke only that verb-owned retry. The verb re-derives fresh evidence and the supplied generation
  authorizes only that named act in that request.
- On `refused` / `error`, render `recommendedPromptText` and stop.

Promotion is a two-call transition owned by [`init-work-unit`][promote-errand-to-wu]. Consume the typed result rather
than inspecting the renamed branch, meta, identity, or marker: `settlement.state: commit-required` retains the exact
identity while the returned `metaPath` is committed; rerun the same command and continue only from the same exact
`subject` and `generation` with `settlement.state: settled`. Render `recommendedPromptText` and stop on
`confirmation-required`, `refused`, or `error`.

Never reconstruct allocation, terminal authority, preservation, cleanup, or continuation from Git branch shape.

When an `open` / `materialize` result asks for directed-command confirmation, confirm that the current session can
run subsequent commands at `allocation.checkoutPath`. If it cannot or the capability is uncertain, recommend a cold
session at that checkout and stop before execution.

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
   - **Resume mode:** consume the exact current checkout selected by session-init; its derived transient role is the
     re-entry authority, so do not invoke `arc errand open` again. A remote-only eligible generation first runs
     `arc errand materialize <slug> --claim-id <claimId> --expected-head <expectedHead> --json`, using the selected
     candidate's claim ID and expected head; accept only its exact returned generation and path. A recorded head
     that no longer matches the fetched remote or open change request refuses materialization. Open identities,
     legacy branch-only candidates, closed or missing change requests, and partial Errands are not materializable.

   Execute every subsequent command from `allocation.checkoutPath`. Retain `parentCheckoutPath` when present as the
   warm-return parent; terminal results own the actual restoration outcome.

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
simulate abandonment by deleting a branch, marker, or identity. Consume the typed terminal result above;
`subject.kind` distinguishes exact full and partial authority, while `settlement` reports the retained capture.

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

The Errand's tracked changes, if any, are ready; now ship and clean up. Integrate branches on protection mode.

For a full-protection Errand with no tracked change, skip Ship and invoke `arc errand close <slug> --json`
directly. The verb completes only when the checkout is clean and the Errand branch, local base, and freshly fetched
remote base all name the same exact head. Any tracked change continues through the ordinary PR path below.

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
   routing input. For each new target, invoke `arc review chunking resolve -` once, including an existing exact-target
   `scopeSelection` when one exists. An Errand has no owning work unit, so ordinary tripped evidence resolves
   authoritative-unbound. Dispatch the closed result without adding delivery judgment:

   - `disabled / none`, `below-threshold / continue-review`, `scope-selected / continue-review`, or
     `evidence-unavailable / continue-review` — render no attention text and continue review.
   - `consider-chunks / select-review-scope` — render `recommendedActionText` verbatim, then make the existing
     bounded review-scope judgment.
   - `delivery-bound / continue-review` — render `recommendedActionText` verbatim and continue; do not infer or
     author Errand-side delivery state.

   Select whole-target or chunked scope separately for each role and pass it to `arc review resolve -`.

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
   settlement, or other mutation/commitment. A complete no-action record-only set must be approved for its exact
   target before continuing. Approved fixes run Tier 1 gates, commit atomically, push, and create a new target.
   Never carry clearance or merge authority.

3. **Resolve the Errand PR** before creation. Invoke the exact-head resolver:

   ```bash
   arc review change-request resolve --head-ref <branch> --head-sha <head-sha> --json
   ```

   Follow only its typed state and action:

   - `none / create-change-request` — enter the creation arm below.
   - `open / reuse-change-request` — reuse `candidate` and enter Step 4.
   - `merged-at-head / complete` — enter Complete.
   - `closed-unmerged / reopen-change-request` — reopen `candidate`, then enter Step 4.
   - `merged-stale-head / reconcile-head` — surface the stale candidate and reconcile before rerunning this step.
   - `ambiguous | blocked / stop` — surface the typed evidence and stop.

   The no-match creation arm uses a **lean errand body** — `template-pull-request` assumes a work unit, so inline a
   one-line Summary plus a one-line Test Plan only when verification is non-obvious. When gated local review ran,
   include `**Local review:** {carrier identity}`; otherwise omit the field entirely. No Spec / Out-of-Scope /
   Follow-Up sections.

   Compose `proposedChangeRequest = { repositoryRef, baseRef, headRef, headSha }`. If `pre-pr-open` is active,
   execute numbered actions in authored order immediately before creation; halt before later actions on failure.
   Retry these retry-safe actions after a failed create, but never run them on the one-open-match reuse path.

   Immediately before creation, re-invoke
   `arc review change-request resolve --head-ref <branch> --head-sha <head-sha> --require-remote --json` with the
   current head and dispatch on its typed state again. Continue only from `none / create-change-request`. This
   pre-create validation requires the remote branch itself to carry the exact creation head, including after any
   hook action.

   Then invoke `arc merge lock resolve -` with the exact tree root. Follow only its typed action:
   `locked / open-locked` creates the PR locked; `none / open-plain` creates it plain; `blocked / stop` halts
   creation before any PR exists. The lane is still unresolved here — it settles in Step 4 — so both lanes open the
   same way, and no lane input reaches this call.

   ```bash
   gh pr create --base <base-branch> --head <branch>            # open-plain
   gh pr create --base <base-branch> --head <branch> --draft    # open-locked
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

   Rerun `arc review chunking resolve -` for the opened target, follow the closed attention dispatch in Step 2, and
   invoke `arc review resolve -` for each incomplete lane. On `ready / hosted-request`, invoke
   `arc review hosted request -` with the selected provider, exact opened target, and `coverage: complete`:

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
   record-only or lifecycle delta; use a focused supplemental check for a bounded interaction. Repeat full review
   for behavioral, authority, contract, materially interacting, or uncertain change. A confident bounded
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

   Invoke authoritative base freshness:

   ```bash
   arc base drift --json
   ```

   After any fix, request action, or append-only base reconcile changes the head, execute the generic push contract,
   rerun chunking, and return through Step 4's review applicability judgment. Use targeted verification only when
   prior complete coverage confidently remains applicable; otherwise run focused or full review. Repeat until
   base, head, requirements, and review are settled.

   Compose the final `openedChangeRequest` and retain `openedChangeRequest.headSha` as `{approved-head-sha}`.

   **Extension report** · `#pre-merge`: If active, execute its `.actions` once for this settled head and render
   their results under this label. Otherwise, skip — an inactive extension renders nothing. The extension fires
   here, before the integration interlock.
   No review-authored commit or push may occur after this checkpoint.

> [!IMPORTANT]
> `integration-interlock`: Stop after the current head is settled and before arming auto-merge or releasing the
> reviewed lane. Surface the exact head, review applicability calls and targeted verification, proposed final
> dispositions, PR checks, required approvals, base freshness, and the resolved lane. State
> that approval applies final dispositions and channel settlement, ends review, invokes the exact-head release on
> whichever lane resolves, and authorizes the lane action.
> Close with `Approve (or redirect)?`.

After approval, apply the approved final dispositions and channel settlements, then continue to the lane action.

6. Land per lane:

   Immediately before either lane action, invoke `arc base drift --json` once more. Only authoritative `clean`
   continues; `reconcile` returns to Step 5, while unavailable or malformed output stops.

   **Auto-merge-lane** — re-read the PR's exact base SHA and rerun the canonical classifier immediately before
   arming. Only literal `planning` preserves this lane; `reviewed` returns to Step 5 as reviewed-lane, while command
   failure or malformed output stops. Invoke `arc review merge-method resolve --json`; `validated / use-method`
   supplies the method, while `blocked / stop` stops before release. Then invoke `arc merge lock release -` for the
   exact approved target — auto-merge cannot be armed on a locked PR, so the release is structurally required here
   rather than a courtesy. Arm native auto-merge with the validated method (`merge` → `--merge`, `squash` →
   `--squash`, `rebase` → `--rebase`):

   ```bash
   arc review planning-lane <base-sha> {approved-head-sha}
   arc review merge-method resolve --json
   arc merge lock release -
   gh pr merge <pr-number> --auto <merge-flag> --match-head-commit {approved-head-sha}
   ```

   **Reviewed-lane** — invoke `arc merge lock release -` for the exact approved target. On both lanes, follow only
   the verb's typed action: `released / proceed` continues; `no-lock / none` continues because no lock applies or
   the PR already holds that state; `blocked / stop` stops on its typed reason.

   Lock release changes PR state only; the auto-merge command's `--match-head-commit` is the head pin. Report
   required-check state as observed. The host remains the waiting authority: native auto-merge waits server-side,
   while the reviewed lane stays open for owner review and host enforcement on `{approved-head-sha}`.

   Once a lane releases, **every other exit re-locks first**. This includes a failed or refused auto-merge arm and a
   later reviewed-lane head change before Step 4 re-entry. Invoke `arc merge lock hold -` for the exact target,
   dispatch on its typed action, then surface the originating exit rather than the hold in its place.

7. **Leave only at a terminal session exit.** When the session is ending with the merge tail unresolved, or work is
   moving machines, invoke `arc errand leave <slug> --state awaiting-merge --json`. Do not leave merely because the
   change request is open, checks or owner review are pending, or to start the next Errand. Otherwise retain the
   owning session and continue to Complete when the host reports the merge.

   If the session is ending before PR creation, commit and push the checkpoint first, then use `--state paused`.
   Partial mode and unpushed or unproven heads refuse. Post-leave work resumes only through the identity's owning
   open or materialize driver; never use the checkout closed by `leave` as a re-entry surface. Consume the typed
   terminal result above; its exact `subject` / `generation`, checkout paths, and identity-tail `settlement` are the
   sole preservation and restoration evidence.

### Ship — partial protection

No branch and no PR: the Errand is a direct base-branch commit, so there is no merge step. The base push follows
the project's normal discipline. It cannot pause, await merge, materialize, or hand off; completion must pop the
exact partial role and remove any originating capture before the session can leave.

### Complete

On merge or exact no-tracked-change proof (full), or final commit (partial), invoke
`arc errand close <slug> --json` and consume the typed terminal result above. Its exact `subject` / `generation`,
checkout paths, and `settlement` are the sole closure evidence.

- **Full protection** — the verb proves either merged-change-request preservation or an unchanged clean base
  generation, finalizes the exact v3 identity tail, reaps refs and any retained checkout safely, and
  drops only its origin capture. A foreign checkout requires the exact generation returned by the verb's
  confirmation result; no
  bypass overrides preservation or host/base evidence.
- **Partial protection** — the completion arm verifies the direct-base result, pops the exact partial role, and
  removes its origin capture through the inbox mutation boundary. It creates no branch, PR, or portable identity.

When the result carries `nextOffer`, offer only that exact file-ordered execute-bound sibling (`kind`, `key`, and
`parentCheckoutPath`). On acceptance, enter from `parentCheckoutPath` when non-null, otherwise from the returned
between-WUs frame; derive and confirm a branch-safe `<slug>` for `nextOffer.key`, then invoke
`arc errand open <slug> --from-inbox <nextOffer.key> --json`. Consume the open result as the new sibling locus. On
decline, return to the restored parent/between-WUs frame. Never scan the inbox for a replacement continuation.

**Post-leave merge.** If the merge lands after the session ends, the [finalize pass][finalize-pass] or next session
re-enters through the identity's owning open or materialize driver, then invokes `arc errand close`. Exact replay is
idempotent and may return the next file-ordered execute-bound offer.

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
