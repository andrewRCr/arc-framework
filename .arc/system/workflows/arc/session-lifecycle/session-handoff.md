---
purpose: Capture session state so the next session can resume with full context — counterpart to session-init.
audience: agent
arc:
  methods:
    - commit-format
    - session-state
---

# Workflow: Session Handoff

**Output discipline:** Between tool calls and the final structured summary, generate text only for (a)
problems, blockers, or detected mismatches; (b) judgment calls the user couldn't infer from the tool
stream; (c) flow-control pivots the user needs to track. Pure narration of tool calls, workflow branches,
or "now reading X" is omitted. Scope-limited override of any harness-default narration cadence for the
duration of this workflow.

## Resolve Handoff Context

Open with the composite probe — single call, slot-wise envelope, per-slot error handling matching the session-init
pattern. Use this as the initial baseline.

```bash
arc status --session-handoff --json
```

| Field                    | Contents                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `identity`               | `{identity, role}` — either may be `null`. Handoff requires a resolved identity                                      |
| `derivedLocusState`      | Required entering-checkout frame; sole handoff subject and workflow/session authority                                |
| `locusGuidance`          | CLI-precomposed current-checkout narration and sibling diagnostics from the same derived frame                       |
| `handoffLocus`           | `Probe<HandoffLocusPlan>` for `between-work-units`, `release-work-unit`, `leave-errand`, or `refused`                |
| `branch`                 | Current branch name; `null` on detached HEAD. Resolved at handler boundary; canonical for the Confirm Handoff header |
| `dirty`                  | `{state: clean / dirty, fileCount}`. Refresh for the session context's "Uncommitted Work" subsection                 |
| `worktree`               | Worktree sync vs `origin/<branch>` — same state vocabulary as session-init. Refresh for unpushed counts              |
| `syncInterlock`          | `{value, source}` — gates handoff auto-invoke of `arc sync` (`on-handoff`/`on-workflow` fire; `manual` skips)        |
| `active`                 | Active meta file resolution + sessionType (same shape as session-init)                                               |
| `head`                   | `{hash: string \| null}` — current HEAD short-hash. Refresh for the Errand checkpoint                                |
| `pushability`            | Pushability pre-check matrix for the worktree push leg                                                               |
| `restateCandidates`      | Structured payload backing the session-context restate filter, measured from the last `State at Handoff`             |
| `pathSet`                | Absolute paths (`null` when N/A); `workingMemory` names `WORKING-MEMORY.md`. Do not re-derive from conventions       |
| `recommendedSummaryLine` | Pre-composed top-of-Confirm-Handoff line (`**Reconcile required:** ...` / `**Worktree:** N unpushed ...` / `null`)   |

**Slot freshness contract.** Refresh after a subject driver or tracked-state mutation, before consuming affected
slots. Carry unchanged slots forward only while the checkout and subject both stay the same. When either changes,
take every slot from a new probe in the surviving checkout before dispatching.

**Identity absent.** If `handoffLocus` reports `identity-missing`, surface the error and stop before dispatch.
Configure a lowercase identity slug with `git config arc.identity <name>`, then retry the handoff.

**Composite probe failure:** If the composite call itself fails, surface the failure and stop. Direct diagnostic
commands may explain the failure, but they never establish a session frame, select a subject, authorize context
loading, or permit mutation.

## Handoff Mode Dispatch

After probing, if `handoffLocus.ok !== true`, surface its error and stop. Then dispatch only on `handoffLocus.value`
using its `kind`.

- **`refused`** — render `recommendedPromptText` verbatim and stop. Incomplete housekeep, unshipped grooming,
  incomplete partial Errands, ambiguous topology, and unproven preservation never fall through to another path.
- **`leave-errand`** — follow [Errand-Session Handoff Path](#errand-session-handoff-path). Preserve the exact
  transient checkout and point the next session back to it.
- **`release-work-unit`** — follow [Active-WU Handoff Format](#active-wu-handoff-format), requiring the active
  artifact projection to match the selected WU role.
- **`between-work-units`** — follow [Between-WUs Handoff Path](#between-wus-handoff-path).

Never select the handoff subject from a branch prefix, active-meta plurality, or session context.

## What to Update

Session state lives in the store and is projected into the checkout (per the [session-state method][arc-methods-session]
default — if your project overrides session-state, follow the override instead):

- **The work unit's meta** — the active work unit's stored record. `arc handoff write` writes its handoff in one
  write: `Next Action`, an optional `Session Type`, and its `## Session Context` section — per-WU session context:
  completed work, decisions, blockers, debugging insights, things tried. The section is replaced each handoff, not
  appended. The verb records `State at Handoff` and `Commit at Handoff` itself. Between work units, or during
  planning cycles with no active WU, no meta exists to write.
- **WORKING-MEMORY.md** — path from `pathSet.value.workingMemory` when `pathSet.ok`.
  Cross-WU persistent context, persisted with `arc save`. Entries survive across handoffs, each carrying an explicit
  `_Remove when:_` trigger reviewed at each handoff (see WORKING-MEMORY entries guidance below).

> **Person-to-person handoff:** Write the session context for someone new to the work. After the normal handoff sync
> and [Finalize Handoff State](#finalize-handoff-state), ensure the work branch is shared and run
> `arc handover <slug> --to <identity>`. If handover refuses, show its remedy and retry after resolving the condition.
> After `handed-over`, publish the new Owner with `arc sync --json` under the sync interlock. Require
> `state.push.result` to be `success` before confirming transfer, then free this checkout with `arc locus release`.
> Without a successful state push, report the transfer as pending. Give the observed reason and any reported remedy,
> then have the sender run or retry `arc sync` to publish the saved Owner change. See the
> [Team Coordination Strategy][team-coordination] § Person-to-Person Task Handoff.

**Active-WU handoff** — the work unit's handoff, written with `arc handoff write`. Use
[Active-WU Handoff Format](#active-wu-handoff-format).

**Errand-session handoff** — the exact ordinary Errand selected by `handoffLocus`. Preserve its checkpoint and
retain the selected checkout for the next session. Use [Errand-Session Handoff Path](#errand-session-handoff-path).

**Between-WUs handoff** — no handoff write. Review WORKING-MEMORY, route any durable captures to existing surfaces (a
capture through `arc-inbox`, `WORKING-MEMORY` for approved additions, backlog artifacts as applicable), then save,
sync, and confirm. Use [Between-WUs Handoff Path](#between-wus-handoff-path).

**When context changes** — capture working-directory paths or environment expectations in the session context only
when they change next-session orientation.

**Preserve persistent context** — `WORKING-MEMORY.md` carries cross-session entries with explicit
removal triggers. See the WORKING-MEMORY steps below for the preservation criterion and review cadence.

## Errand-Session Handoff Path

Use this path only for `handoffLocus.value.kind === "leave-errand"`.

1. **Checkpoint local progress** — inspect `dirty` / `git status` at `checkoutPath`. If the tree is dirty, stage only
   errand-scoped changes. If unrelated or ambiguous changes are present, surface them before committing. If the
   tree is clean and no commits are local-only, skip the checkpoint commit and proceed to the push check.
2. **Commit the checkpoint when needed** — this is a temporary errand checkpoint, not a WU ceremony. Use raw
   `git commit` with the appropriate standalone context footer from [commit-footer][commit-footer]; do not write
   a handoff.

    ```text
    chore(errand): checkpoint <slug>

    - Preserve resumable Errand state for <slug>

    Context: standalone (<kind>)
    ```

   **Subject-length guard.** Apply [`commit-format`][commit-format]'s literal-workflow-subject identity fallback to
   `<slug>`; keep the exact identity in the body.

3. **Preserve and leave the exact Errand** — before leaving, retain the exact surviving return checkout from the
   same derived frame: the marker parent when it resolves to one registered checkout, otherwise the physical primary
   row. Push the checkpoint through the normal Errand path, then invoke `arc errand leave <slug> --state paused --json`.
   Render `recommendedPromptText` verbatim. The driver validates the exact claim and head, stores the resumable identity
   tail, closes local occupancy, and reports `parentCheckoutPath`. Require that field to match the retained parent when
   one existed. Refusal or error stops; never hand-build the sequence.

    From `checkoutPath`, push the selected branch. Set its upstream on the first push; otherwise use the existing
    upstream. If the push fails, retain the local checkpoint and stop without invoking `arc errand leave`.

    ```bash
    git push -u origin <branch>   # first push
    git push                      # upstream already exists
    ```

4. **Return and refresh** — direct subsequent commands to the retained surviving checkout before re-running the
   composite probe. Do not probe from the removed Errand checkout.

    ```bash
    arc status --session-handoff --json
    ```

   Use the complete probe from the surviving checkout as the new baseline. Require its `handoffLocus.value` to be
   `release-work-unit` at the result's exact `parentCheckoutPath`, or `between-work-units` at the retained primary
   checkout when the Errand was cold. Any other result stops. Continue through the matching WU or between-WUs path;
   do not end handoff at the transient.

## Between-WUs Handoff Path

Use this path when `handoffLocus.value.kind === "between-work-units"`.

1. **Review `WORKING-MEMORY.md`** — apply the criterion in the WORKING-MEMORY entries guidance below. Remove entries
   whose triggers are met and entries whose information is now carried in project state. Surface removals in the
   handoff summary; do not silently rewrite.
2. **Route durable handoff context** — if anything must survive the handoff, write it to an existing
   authoritative surface: a capture through `arc-inbox` for deferred personal work, `WORKING-MEMORY` for cross-WU
   persistent context, once its addition is approved, or backlog artifacts when the project document is already the
   clear home. Do not write a session context or a placeholder marker.
3. **Check and save** — after WORKING-MEMORY edits or durable context routing, run `arc check increment` over the state
   this handoff authored, correcting and re-checking its own edits when a check fails, then persist them:

    ```bash
    arc save
    ```

   Name any failure left in unfinished work in the handoff summary rather than stopping to ask.
4. **Refresh probe** — re-run the composite probe:

    ```bash
    arc status --session-handoff --json
    ```

   Use the refreshed envelope as the sync baseline, including `handoffLocus`, `worktree`, `dirty`, `head`, and
   `recommendedSummaryLine`.
5. **Run [Sync](#sync)**.
6. **Run [Confirm Handoff](#confirm-handoff)**. Use `session-init discovery / user direction` for
   **Next session** unless the user gave a concrete next action during handoff.

## Active-WU Handoff Format

Use this path when `handoffLocus.value.kind === "release-work-unit"`. Resolve the active meta only through the
selected WU row's derived context; if the `active` artifact slot disagrees, stop instead of disambiguating.

Write the handoff before ending the session:

1. **Review `WORKING-MEMORY.md`** — apply the criterion in the WORKING-MEMORY entries guidance below.
   Remove entries whose triggers are met, AND entries whose information is now carried in project
   state (the criterion catches drift introduced by earlier sessions). Surface removals in the
   handoff summary; do not silently rewrite.
2. **Check and save** — run `arc check increment` over the state this handoff authored. Correct and re-check its own
   edits when a check fails; record failures in unfinished state or code under Remaining Work in the session context,
   without a fix-now/defer stop. Then persist any edits:

    ```bash
    arc save
    ```

    **Skill invocation is the approval.** `/arc-handoff` is user-initiated; the invocation grants approval for the
    workflow's bundled actions, including the save and the handoff write, but not a `WORKING-MEMORY` addition, which
    lands only on its own approval. No separate prompt fires under either push-interlock mode — push behavior is gated
    by `arc sync` internally (see § Sync), where remote-side consequences justify granular gating.
3. **Write the handoff** — compose `nextAction`, any `sessionType`, and the session context per the guidance below,
   then pass the request on standard input (or as a file path in place of `-`):

    ```bash
    arc handoff write -
    ```

    ```json
    {
      "schemaVersion": 1,
      "sessionContext": "### Uncommitted Work\n\n[none]\n\n…",
      "nextAction": "Start Task 3.3 — Write unit tests for validation logic"
    }
    ```

    A `written` result carries the recorded `stateAtHandoff` and `commitAtHandoff`. Render each `text` in its
    `maintenance` report and any `diagnostics` in Confirm Handoff. A `refused` result names its condition and remedy:
    take the remedy and retry once, or surface it and stop.

4. **Check the written handoff** — before [Sync](#sync), run the project's Markdown lint on the written meta using
   its explicit path from the active work unit's derived context. For a declared Markdown selection check, use
   `arc check run <markdown-check-id> --paths <meta-path>`. Confirm the projection contains the new handoff before
   checking. If it is stale, refresh it with `arc status --session-handoff --json` and verify the written meta.
   Correct handoff-authored issues in the request, write the corrected request with `arc handoff write`, and recheck
   before Sync. Carry unrelated findings under Remaining Work in the final request.

**Next Action** (`nextAction`, required) — the next task with its ID and title (`Start Task 3.3 — Write unit tests for
validation logic`), or a specific preparatory or off-task-list action; say so when work runs out of task-list order.
Keep it to one line (two for a multi-file scope), wrapped to the 120-char target; push longer context into the session
context or task-list completion notes.

_Workflow step pointer: when Next Action resumes a lifecycle workflow, use the literal format
`<workflow-name> Step <N> — <description>` (for example, "integrate-work-unit Step 1 — push and create PR";
kebab-case name = filename without `.md`). This is a human resume pointer; typed status determines session phase
and workflow. Task-list-driven workflows (process-task-loop) skip it; the task list is the pointer._

**Session Type** (`sessionType`, optional) — `planning | execution`. Set it only when the next session's discretionary
planning/execution intent diverges from what the work unit's state implies (e.g., status points at execution, next
session will plan a separate concern); omitting it clears an earlier override. Typed
prepublication/integration phases cannot be overridden: never set it to enter, leave, or replace one.

**Compose the session context** (`sessionContext` — per-WU session context; active-WU path only). Between-WUs handoff
skips this section entirely.

**Audience:** The next session's agent loading from cold context. Check what it can still derive from the normal
load set after this write replaces the section. Carry forward still-applicable items, including unresolved
blockers, whose only record is the outgoing Session Context.

**Filter pipeline — apply both passes:**

**Pass 1 — Cross-check `restateCandidates`.** Probe slot carries `commitsSinceHandoff`,
`tasksClosedSinceHandoff`, and `noteFileChangesSinceHandoff` for this session. If candidate content
paraphrases an entry, omit. Mechanical step — array-driven, not judgment. When the soft signal
"baseline unknown" fires, skip Pass 1 and rely on Pass 2.

**Pass 2 — 3-criterion filter on the residual:**

1. **Absent from sources that survive this write.** Check Git history, the task list, the rest of the meta,
   `notes-*.md`, and durable project documents the next session loads.
2. **Acted on at step 0.** Orientation-relevant — changes what the next session does or checks when
   it loads. Not a retrospective observation you "want on record."
3. **Costly if missing.** Re-deriving from project state in 30 seconds is not rework; a
   misinterpretation costing an hour of re-debugging is.

If any criterion fails, omit. Empty subsections write `[none]`.

**Session context skeleton** — level-three subsections. A line opening with `##` and a space, or a standalone `---`,
would end the meta's section, so `arc handoff write` refuses it.

```markdown
### Uncommitted Work

<!-- Wrap continuation lines on bullets to the 120-char target. Under-wrapping (60-80 chars)
     is the common failure here — see DEV-RULES.PROJECT § Documentation Standards. -->

[Commit-level detail for any uncommitted work. Otherwise: [none].]

### Remaining Work Before Returning to Task List

[Off-task-list work with known path back. Otherwise: [none] or "Path unclear".]

### Blockers

[Blockers, pending decisions, or waits on clarification. Otherwise: [none].]

### Additional Context

[Only if the filter passes. Otherwise: [none].]
```

**Per-section guidance:**

- **Uncommitted Work:** Work the next session can only see in `git diff` — committed work is
  already in `git log`. Use commit-level granularity so the next session can reconstruct atomic
  commits. Map accomplishments to logical commits (what changed, which files), include task
  numbers for `Context:` footers, note incidental work separately. Write `[none]` when everything
  is committed (the common case after a deferred-review scope finishes). Examples:

    - ✅ Task 3.2.1: Added input validation to config parser (src/config.py, src/validators.py) —
      rejects malformed YAML
    - ✅ Task 3.2.2: Updated API response schema (api/v2/schemas.py:45–67) — added nullable fields
    - ✅ Incidental: Fixed broken cross-reference in workflow doc (session-init.md)

- **Remaining Work Before Returning to Task List:** Off-task-list work with a known path back.
  List all steps, not just the next. Use triple-anchor format for the return target. If the path
  is unknown, state it: "Path unclear — will return to Task X.Y when resolved."
- **Blockers:** What stops progress until someone acts — a pending decision, a wait on clarification or another
  work unit. Session-init withholds auto-proceed on a blocker; write `[none]` when nothing blocks.
- **Additional Context:** Debugging insights, decisions not in project state, things tried and
  ruled out, observed risks, "currently mid-X with concrete next action Y" mid-task stops.
  Record an Owner direction with the subject it answered — the gate, Errand, or head — so the next session does
  not read it as standing posture for other work. Filter applies — empty is normal.

- **WORKING-MEMORY entries:** Cross-WU persistent context — entries that survive across handoffs
  (and WU boundaries) at the identity's `WORKING-MEMORY.md` (`pathSet.value.workingMemory`). Each needs an explicit
  removal trigger (not tied to full work unit completion). Same filter as above. An addition is proposed and lands
  only on approval; invoking the handoff does not approve it.

    - **Passes:** forward-looking constraints (terminology for an unlanded rename), un-codified
      meta-conventions, references to uncommitted work left visible in `git status`.
    - **Fails:** mechanism decisions already in a plan doc's § Resolved Decisions, rules already
      in a strategy doc, behavioral guidance already in DEV-RULES.
    - **Anti-pattern (planning sessions):** writing an entry for every mechanism decision
      resolved in the plan doc — WORKING-MEMORY is not a substitute for § Resolved Decisions.
    - **Anti-pattern (future-WU drift):** activation-audit reminders inside a backlog
      `draft-*.md` for an unactivated WU. Write them into the plan doc itself; the activating
      session sees them naturally.

    Review at each handoff: remove entries whose triggers are met, AND entries whose information
    is now carried in project state.

**Stay-out list — when you notice yourself writing one of these, delete it:**

- Forward-looking content the next session will read when they get there (phase previews,
  upcoming-task summaries, "things NOT to re-do" lists).
- Process narration (debugging steps, mid-task discoveries, tooling gotchas). Codify durable
  lessons in a strategy or QUICK-REFERENCE — not here.
- Probe-owned volatile git state — unpushed-commit counts, ahead/behind numbers, dirty file counts.
  The next session-init recomputes these fresh from git, and this handoff's own sync leg (§ Sync)
  drives the unpushed count to zero, so a recorded count reads false at next load. The session context
  reflects _post-handoff_ state, not the moment-of-writing snapshot. Intentionally-left uncommitted
  work is the exception — record it under Uncommitted Work above; it's working context visible only
  in `git diff`, not a transient count the sync leg erases.
- Explanatory paragraphs where the template expects whitespace. Empty subsections stay empty.

(Restating project state is the most common failure but already excluded by Pass 1 — see the
filter pipeline above for the full case.)

## Handoff Examples

**Example 1: Off-task-list with known path back**

`nextAction`: `Fix connection timeout in batch processor (src/pipeline/batch.py:89), then Task 4.1 — Add retry logic`

`sessionContext`:

```markdown
### Uncommitted Work

[none]

### Remaining Work Before Returning to Task List

1. Fix connection timeout in batch processor (pool exhaustion under load)
2. Add integration test for concurrent batch processing
3. Run full test suite to verify no regressions
4. Return to Task 4.1 — Add retry logic (line ~312 in tasks-data-pipeline.md)

> **Unclear path variant:** When the fix isn't known yet, replace the numbered steps with:
> `Path unclear - exploratory debugging. Will return to Task 4.1 — Add retry logic (line ~312)
> when resolved.`

### Blockers

[none]

### Additional Context

- Discovered timeout when batch size exceeds 1000 records (connection pool default is 10).
- Tried increasing pool size to 50, but underlying issue is sequential processing blocking connections.
- Best fix: switch to async batch processing with connection pool recycling.
```

## Task List Completion & Transition

**When every task is closed**, use typed status to name the first pending verification, preparation, or integration
step in Next Action. For an Active unit ready for its first attestation, use `verify-work-unit Step 3 — attest the
Candidate`. Use Archive Step 1 only after its prerequisites hold, including Integrating state and completed composition.

Archiving clears the session context, both anchors, and `Session Type`, and resets Next Action. WORKING-MEMORY.md
persists unchanged across the archive boundary — its entries' eviction triggers handle cross-WU lifecycle.

## Handing Off Mid-Integration — `Integrating`

PR open and awaiting review across the wait: the work unit stays `Integrating` and Next Action points at the integrate
resume step (`integrate-work-unit Step <N> — <description>`) — the next session resumes there. A PR that merged
during this session is finalized by the § Sync finalize pass, not left here.

## Sync

First, run the [Same-session finalize pass](#same-session-finalize-pass) — a no-op unless this session opened an
unfinalized PR.

For active-WU and between-WUs handoff, sync is gated on `syncInterlock.value`. `arc sync` pulls state, publishes it
first and alone, then pushes the branch, and reports each separately; the ordering, the pull's handling, and push
recovery live in the CLI, not in workflow prose. See [Session Operations Strategy][session-ops] § Push Toggles for the
underlying model.

- **`on-handoff`** (default) / **`on-workflow`** — auto-invoke and consume the structured
  output. Both values fire sync at handoff.

    > [!CAUTION]
    > `sync-interlock` release — auto-invoke `arc sync`:

    ```bash
    arc sync --json
    ```

  Surface the result per § Confirm Handoff. If the pull stops or reports `designation-needed` without settling it,
  state publication is blocked and sync exits nonzero. Follow the reported remedy, using `arc store remote` for a
  pending designation, then retry. Resolve the remedy conversationally without blocking on a TTY prompt.

- **`manual`** — skip the auto-invoke. The user runs `arc sync` when ready. The latest `recommendedSummaryLine`
  carries the unpushed / Reconcile surface (see § Confirm Handoff).

## Finalize Handoff State

After state capture and sync, require `handoffLocus.ok === true` and consume the latest `handoffLocus.value`:

- `release-work-unit` — write no generic locus state; the WU remains derived from its checkout and stored lifecycle.
  Its checkout stays held unless released (`arc locus release`), as a person-to-person handoff does.
- `between-work-units` — write no generic locus state; a cold transient's subject driver already settled its own
  occupancy.
- Any transient or `refused` result — stop. Its subject driver has not restored a handoff-safe frame.

The subject leave/close driver owns transient settlement. Never invent a WU or parent from stale probe-1 facts.

## Confirm Handoff

After completing the selected handoff path and sync step, deliver a verbal summary to the user. This is
a quick confirmation for the human — the stored handoff and routed captures are the durable artifacts.

**ARC session handoff complete** · `{branch-name}` · {clean | uncommitted changes}

When `worktree.value.identity.kind === "linked"`, insert `` · `worktree: {identity.path}` `` into the header
after the branch — naming the non-primary worktree the session occupies. Omit entirely in the primary worktree.

For active-WU and between-WUs handoff, render **Sync:** from each actual `arc sync --json` envelope.

- **State pull** (`state.pull`) — report the result and relevant detail, including a stopped pull or failed read source.
- **State push** (`state.push`) — say whether state reached the remote, was already current, or was blocked or failed.
  A `no-remote` pull with a `noop` push means state is local-only. For `designation-needed`, give the designation remedy.
- **Branch** (`worktree`) — report the action and its outcome, including a successful push or pull, or a skipped,
  blocked, or failed action. Name the branch and report any supplied reason and remedy.

If sync was manual, say it was skipped and give `arc sync` as the next command. For a person-to-person handoff,
report pending publication explicitly when the new Owner has not been published.

For Errand handoff, render **Errand:** with the checkpoint commit hash or `no new commit`, plus the selected
branch's push result.

**Checkout:** [work-unit checkout retained | work-unit checkout released | Errand checkout retained | between work
units]

**Next session:** [Task list pointer (on-task-list), exact retained Errand checkout, freeform (off-task-list), or
`session-init discovery / user direction` between WUs]

**Conditional top-level sections** — prepend each applicable surface above the current result block (`**Sync:**`
or `**Errand:**`):

- Prepend the non-null `recommendedSummaryLine` verbatim from the latest `arc sync --json` envelope when sync ran,
  or from the latest probe in manual mode.
- From each actual `arc sync --json` result, prepend a present `tripwires.contention.text` verbatim.
- `arc handoff write`'s `maintenance` report or `diagnostics` non-empty: prepend each `text` and diagnostic verbatim.

**Formatting guidance:**

- Mirrors the session-init orientation summary — bookend pattern. Confirm Handoff doesn't restate
  what got done (the session context, git log, task list, and routed captures already carry it); the verbal output is
  operational confirmation, not a session retrospective.
- **Next session**: one line on-task-list (the Next Action pointer); unbounded only when off-task-list
  — same bounding as session-init orientation Next Action.
- An Errand handoff is framed on its retained exact checkout; a WU or between-WUs handoff stays framed on that
  resolved locus.

## Same-session finalize pass

Finalize this session's PRs that merged outside an attended ceremony. A no-op unless this session opened a PR
that has not been finalized — resolve this session's candidate branches (the WU or `chore/<slug>` branches whose
PRs this session opened) and return when there are none.

Resolve each candidate branch's exact local head with `git rev-parse --verify "refs/heads/<branch>^{commit}"`, then
invoke the typed resolver once — never a wait-loop (never block on CI):

```bash
arc review change-request resolve --head-ref <branch> --head-sha <head-sha>
```

An unavailable local head is **failed / blocked**; never substitute a host-reported or remembered head.
Dispatch only on its typed state and action:

- `merged-at-head / complete` → **merged-clean** — finalize the candidate. Each cleanup step is presence-guarded.
    - **work-unit candidate** → enter integration's [merged-PR tail][merged-pr-tail] with the candidate work unit
      and the resolver's `targetRef.repository` as `repositoryRef`. Apply integration's composition and archive
      prerequisites first. Follow the tail through delivery closeout, including its terminal landing check. Continue to
      teardown only on `closed-out`. On `blocked` or any other result, preserve the checkout, surface the result and
      any remediation it supplies, and retry closeout after resolving the condition.
    - **errand candidate with a record** → `arc errand close <slug> --json`: consume its typed result while it
      restores or tears down the exact checkout, retires the owned locus and identity generation, reaps refs, and
      settles only the originating capture generation;
    - **recordless `chore/<slug>` cheap-branch candidate** → `arc teardown --branch <branch>`: reaps the merged
      branch containment-safe, removes any distinct worktree, and prunes stale remote-tracking refs.
- `none / create-change-request`, `merged-stale-head / reconcile-head`, `closed-unmerged / reopen-change-request`,
  `blocked / stop`, or `ambiguous / stop` without `headAhead` → **failed / blocked** — surface loudly, for both the
  manual- and auto-merge lanes.
- `open / reuse-change-request`, or `ambiguous / stop` with `headAhead: true` (the open request lags only a newer
  head that is unpushed or not yet seen by the host) → **still-pending** — hand to the session-init completion
  sweep; no action this session.

[arc-methods-session]: ../../../methods/session-state.md
[commit-format]: ../../../methods/commit-format.md
[commit-footer]: ../../../methods/commit-footer.md
[team-coordination]: ../../../../reference/strategies/arc/strategy-team-coordination.md
[session-ops]: ../../../../reference/strategies/arc/strategy-session-operations.md
[merged-pr-tail]: ../work-unit-lifecycle/integrate-work-unit.md#10-behind-base-reconcile-gate-and-merge
