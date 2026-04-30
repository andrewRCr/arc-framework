---
purpose: Capture session state so the next session can resume with full context — counterpart to session-init.
audience: agent
arc:
  methods:
    - session-state
---

# Workflow: Session Handoff

**Output discipline:** Between tool calls and the final structured summary, generate text only for (a)
problems, blockers, or detected mismatches; (b) judgment calls the user couldn't infer from the tool
stream; (c) flow-control pivots the user needs to track. Pure narration of tool calls, workflow branches,
or "now reading X" is omitted. Scope-limited override of any harness-default narration cadence for the
duration of this workflow.

## Resolve Handoff Context

Open with the composite probe — single call, slot-wise envelope, per-slot error handling matching
the session-init pattern:

```bash
npx arc status --session-handoff --json
```

| Field      | Contents                                                                                                       |
|------------|----------------------------------------------------------------------------------------------------------------|
| `identity` | `{identity, role}` — either may be `null`. `identity === null` short-circuits the notes-sync slot              |
| `dirty`    | `{state: clean / dirty, fileCount}`. Consumed by Pre-Update Verification                                       |
| `worktree` | Worktree sync vs `origin/<branch>` — same state vocabulary as session-init                                     |
| `user`     | Notes sync state (`value.state`: clean / remote-ahead / conflict / disabled / remote-unavailable)              |
| `autonomy` | `{value, source}` — push-interlock mode (`manual-commit` requires explicit invocation; `auto-push` fires here) |
| `syncPush` | `{policy, source}` — resolved `user.sync_push` (always / prompt / manual)                                      |
| `active`   | Active status file resolution + sessionType (same shape as session-init)                                       |
| `head`     | `{hash: string \| null}` — current HEAD short-hash for the `Commit at Handoff` anchor                          |

**Identity absent** (`identity.identity === null`): Skip the notes-sync slot — notes operations
depend on identity for path resolution. Surface a warning in the handoff summary. Sessions without
identity cannot push notes.

**Probe failure fallback**: If the composite call fails, fall back to direct commands:
`git status --porcelain`, `git status -sb` (or `git rev-list --count`), `git config arc.identity`
/ `arc.role`. Note the degradation in the handoff summary.

Carry slot values forward to the steps that consume them — don't re-probe.

## What to Update

Session state is split across tracked project state and personal session state (per the
[session-state method][arc-methods-session] default — if your project overrides session-state,
follow the override instead):

- **Active status file** (tracked) — project state for the active work unit:
  `status-{name}.md` in `.arc/active/{category}/` for Full mode, `status.md` in `.arc/active/`
  for Lite mode. Carries `**State:**`, `**Branch:**`, `**Task List:**`, `**Next Task:**`,
  `**Last Completed:**`, `**Blockers:**`, and `**Next Action:**`. Between work units or during
  planning cycles with no active WU, no tracked status file exists.
- **SESSION-NOTES.md** (gitignored, `.arc/user/{identity}/`) — personal context: completed work, decisions,
  debugging insights, things tried. Replaced each handoff (not appended). Created only when there's context
  worth preserving. Between work units, reset to persistent context only (if any exists) or a minimal
  completion marker. Identity resolved from `git config arc.identity`.

> **Person-to-person handoff:** If handing off to a different developer (not just ending your
> own session), write SESSION-NOTES.md for someone with no prior context on this work and
> reassign task ownership via `(@name)` markers. See [Team Coordination
> Strategy][team-coordination] § Person-to-Person Task Handoff for the full protocol.

**Every handoff** — active status file (if an active WU exists) and SESSION-NOTES.md
session context

**When context changes** — Working directory paths or environment expectations in the active
status file (if one exists)

**Preserve persistent context** — `## Persistent Context` carries cross-session entries with explicit
removal triggers. See § Comprehensive Handoff Format step 1 and § Persistent Context below for the
preservation criterion and review cadence.

## Comprehensive Handoff Format

Update session state files before ending session:

1. **Review `## Persistent Context`** — apply the criterion in the Persistent Context entry
   below. Remove entries whose triggers are met, AND entries whose information is now carried in
   tracked state (the criterion catches drift introduced by earlier sessions). Surface removals in
   the handoff summary; do not silently rewrite.
2. **Write SESSION-NOTES `**Working On:**`** using the marker vocabulary established in the
   SESSION-NOTES template:
    - `status-{name}.md` — normal case, file reference
    - `[none]` — no active work
    - `[planning: {category}/{name}]` — planning cycle, no WU yet
    - `[between work units]` — between activation and archive of adjacent WUs
3. **Update the active status file + commit** (if an active WU exists) — advance
   `**Last Completed:**`, `**Next Task:**`, `**Next Action:**`, and any other load-bearing fields.
   Status-file changes land as a dedicated `chore(status): handoff` commit per
   [DEV-RULES.ARC][dev-rules-arc] § Status-file commit shape — never bundled with content or
   structural commits.

    **Skip threshold.** Update fields only when changes are materially relevant to next-session
    orientation. Test: "Would the next session do anything different at step 0 with this change?"
    If no, skip — even when a field is technically different. Concrete signals to update:

    - Task advanced (Last Completed / Next Task changed)
    - Blockers added or resolved
    - Branch / Spec / Task List field changed
    - Next Action describes work that didn't exist before

    Below threshold (skip): minor rephrasing of Last Completed / Next Action with no semantic
    change, cosmetic reorderings, restating the same Next Action in different words.

    **Autonomy gating** — read `autonomy.value` from the probe:

    - `auto-push`: stage and commit. No ask — autonomy is the approval.
    - `manual-commit` (default): stage, then prompt the user `Commit chore(status): handoff?`. On
      accept, commit. On decline, leave staged; surface "Status file dirty, not committed" in the
      handoff summary so next session sees the gap.

    ```bash
    git add <resolved-status-file-path>
    git commit -m "chore(status): handoff

    Context: <task-list>.md (handoff)"
    ```

    The new HEAD becomes the `**Commit at Handoff:**` value written in step 4. If no field
    cleared the skip threshold, the file is clean and no commit fires.

    Contributors (`arc.role = contributor`) skip the commit — their personal active status file at
    `.arc/user/{identity}/active/status-{name}.md` is gitignored, so the field update lands
    without staging.
4. **Write SESSION-NOTES** per the guidance below. Record `**Commit at Handoff:**` from
   `head.value.hash` (the probe captured pre-step-3; if step 3 fired a chore commit, run
   `git rev-parse --short HEAD` once to refresh — the post-commit HEAD is the right anchor).

**Update the active status file** (tracked project state, if an active WU exists):

<!-- arc:if team.mode == true -->
> **Team mode:** The active status file represents work-unit state, not personal state. "Next Task"
> should reflect the WU's overall next incomplete task, not your personal next task (which
> is determined by `(@name)` markers at session-init). When multiple developers are active, the
> last committer's update wins — this is expected and resolved at session-init via `(@name)`
> filtering. Before writing, check whether the active status file changed since session-init
> (`git diff <resolved-status-file-path>`) — if another developer updated it mid-session,
> incorporate their changes rather than silently overwriting.
<!-- arc:endif -->

```markdown
## Active Work

**State:** In Progress
**Branch**: [current branch name, e.g., feature/config-parser]
**Task List**: [path to task list, e.g., .arc/active/feature/tasks-config-parser.md]
  [OR: [none associated] for planning/boundary work between task lists]
**Next Task**: Task 3.3 — Write unit tests (line ~247)
  [REQUIRED when following task list — triple-anchor format enables graduated lookup at session init]
  [Always points to the next task to work on (or continue if mid-task). Never [none] when incomplete tasks remain.]
  [Omit only when no task list exists or all tasks are complete.]
**Last Completed**: Task 3.2 — Add validation logic
  [OR for off-task-list: brief description, e.g., "Fixed connection timeout in batch processor"]
  [OR if work complete: "Backend Type Safety (Tasks 1-14, archived)"]
**Blockers**: [none]
  [OR: describe blockers, pending decisions, waiting on user clarification]
**Next Action**: Start Task 3.3 — Write unit tests for validation logic
  [OR for off-task-list/preparatory: specific action description]
  [Freeform — can be preparatory work, off-task-list activity, or simply "start Next Task"]

_Note: Next Task shows WHICH task (stable pointer — always the next incomplete task). Next Action shows
WHAT to do next (freeform — can be prep work, off-task-list activity, or specific subtask in progress)._

_Content discipline: the status file is a project pointer, not session narrative. Keep each field to one
line (Next Action may span two when it names a multi-file scope). Push longer context elsewhere — commit
body for what-and-why, SESSION-NOTES for next-session context, task list completion notes for per-task
detail. If Last Completed or Next Action exceeds ~2 lines, the content likely belongs in one of those
surfaces instead. When fields do span lines, wrap to the 120-char target — under-wrapping (60-80 chars on
continuation lines) is the common failure here._

_Workflow step pointer: When the next action resumes a lifecycle workflow (integrate, archive, rotate,
activate-planning-branch), include the workflow name and step — e.g., "integrate-work-unit Step 7 —
push and create PR". Task-list-driven workflows (process-task-loop) don't need this; the task list
checkbox state is the pointer._
```

**Update `.arc/user/{identity}/SESSION-NOTES.md`** (personal session context — gitignored):

**Audience:** The reader is the next session's agent loading from cold context. They already have
tracked state — git log, task list, active status file, commit bodies, `notes-*.md`, PRD, constitution,
strategies. Write only what they can't derive from any of that. The goal is signal, not length. A
genuinely rich session may produce a longer note; a routine session produces a shorter one. Volume
is a side effect, not a target.

**The filter — include only if all three hold:**

1. **Not carried in any tracked source.** If the fact lives in a commit body, task list,
   `notes-*.md`, PRD, strategy, or constitution, that source is authoritative. Duplicating it here
   creates a shadow copy that drifts.
2. **The next session will act on it at step 0.** Orientation-relevant — it changes what the next
   session does or checks when it loads. Not a retrospective observation you "want on record."
3. **Missing or wrong would cost real rework.** Re-deriving from tracked state in 30 seconds is
   not rework; a mis-interpretation costing an hour of re-debugging is.

If any of the three fails, omit. This is the same criterion Persistent Context enforces — it
applies to every ephemeral section too.

**Template skeleton:**

```markdown
## Handoff Metadata

**Working On:** status-{name}.md
<!--
Markers:
  [none]                        — no active work
  [planning: {category}/{name}] — planning cycle, no WU yet
  [between work units]          — between activation and archive of adjacent WUs
  status-{name}.md              — normal case, file reference
-->

**Commit at Handoff:** `{{short-hash}}`
<!--
  **Session Type:** {planning | execution | integration}
  Optional override; absent → inferred from tracked state. Set only when the next session's
  intent diverges from what the active status file implies. Case-insensitive. Invalid value →
  ignored + warning at session-init.
-->

## Uncommitted Work

<!-- Wrap continuation lines on bullets to the 120-char target. Under-wrapping (60-80 chars)
     is the common failure here — see DEV-RULES.PROJECT § Documentation Standards. -->

[Commit-level detail for any uncommitted work. Otherwise: [none].]

## Remaining Work Before Returning to Task List

[Off-task-list work with known path back. Otherwise: [none] or "Path unclear".]

## Additional Context

[Only if the filter passes. Otherwise: [none].]

## Persistent Context

<!-- Entries that survive across handoffs. Each has an explicit removal trigger. -->
<!-- Review at each handoff: remove entries whose triggers have been met. -->

**[Entry name]:**
_Remove when: [explicit trigger condition]_

- [Context that must persist until trigger is met]
```

**Session Type override (optional):** Add `**Session Type:**` to Handoff Metadata only when the
next session's intent diverges from what the active status file implies — for example, status
points to an in-progress execution WU but the next session will plan a separate concern. Absent
(default) → session-init infers from tracked state. Don't write by default; the inference covers
the 99% case.

**Uncommitted Work:** Committed work lives in `git log`, task list checkboxes, and the status
file's `**Last Completed:**` pointer — restating it here fails filter criterion #1 (already in
tracked sources). Reserve this section for work the next session can only see in `git diff`. Use
commit-level granularity so the next session can reconstruct proper atomic commits:

- ✅ Task 3.2.1: Added input validation to config parser (src/config.py, src/validators.py) —
  rejects malformed YAML
- ✅ Task 3.2.2: Updated API response schema (api/v2/schemas.py:45–67) — added nullable fields
- ✅ Incidental: Fixed broken cross-reference in workflow doc (session-init.md)

Map accomplishments to logical commits (what changed, which files), include task numbers for
`Context:` footers, note incidental work separately from task list work. When everything is
committed (the common case after a deferred-review scope finishes), write `[none]`.

**Remaining Work Before Returning to Task List:** Only for off-task-list work when the path
back is known. List all steps, not just the next one. Use triple-anchor format (task number +
title + line hint) for the return target. When the path is unknown, state it: "Path unclear —
will return to Task X.Y when resolved."

**Additional Context:** Supplemental information that passes the filter — debugging insights,
decisions not in commit bodies, things tried and ruled out, constraints discovered. If nothing
passes the filter, write `[none]`. Empty is the normal case for routine sessions.

**Persistent Context:** Entries that survive across handoffs. Each needs an explicit removal
trigger (not tied to full work unit completion). Same criterion as the filter above — tracked
state is authoritative.

- **Passes:** forward-looking constraints (terminology for a rename that hasn't landed),
  un-codified meta-conventions (rules not yet in a strategy doc), parking references (to
  uncommitted work visible in `git status`).
- **Fails:** mechanism decisions already in a plan doc's § Resolved Decisions, architecture
  rules already in a strategy doc, behavioral guidance already in DEV-RULES.
- **Anti-pattern** (common during pre-PRD planning): writing a persistent-context entry for
  every mechanism decision resolved in the plan doc. Persistent context is not a substitute
  for the plan doc's § Resolved Decisions section.
- **Anti-pattern** (future-WU drift): writing persistent-context entries for stale references
  or activation-audit reminders inside a backlog `plan-*.md` for a WU that hasn't activated.
  These don't apply to interim sessions — they apply once, when that WU activates. Write the
  note into the plan doc itself; the activating session sees it naturally.

Review at each handoff: remove entries whose triggers are met, AND entries whose information
is now carried in tracked state.

**Anti-patterns — omit by name.** When you notice yourself writing one of these, delete it and
trust the tracked source:

- ❌ **Restating tracked content.** Anything already in a commit body, task list, status file,
  or `notes-*.md` — including commit-by-commit narration, completed-task summaries, and
  design-decision retrospectives. The next session reads tracked state first; SESSION-NOTES is
  the delta. Cross-reference at most; don't restate.
- ❌ **Forward-looking content the next session reads when they get there.** Phase previews,
  upcoming-task summaries, "things NOT to re-do" lists. The task list and tracked state surface
  this naturally at step 0 — no need to mirror them.
- ❌ **Process narration.** "Table-width math was tight; commit-body length warnings fired
  twice; markdown-table-prettify has a stdout gotcha." Session retrospective, not next-session
  context. If one observation becomes a durable lesson, codify it in a strategy or
  QUICK-REFERENCE — not SESSION-NOTES.
- ❌ **Explanatory paragraphs where the template expects whitespace.** An empty Persistent
  Context section is fine as empty. Don't write prose explaining why it's empty.

**Minimum viable SESSION-NOTES — what belongs here:** If it doesn't fit one of these, it
probably doesn't belong:

- Things tried that didn't work (not yet captured in a commit or notes file)
- Decisions not captured in tracked state
- Observed risks
- "Currently mid-X with concrete next action Y" when stopping mid-task

## Handoff Examples

**Example 1: Off-task-list with known path back**

status-data-pipeline.md:

```markdown
## Active Work

**State:** In Progress
**Branch**: feature/data-pipeline
**Task List**: .arc/active/feature/tasks-data-pipeline.md
**Next Task**: Task 4.1 — Add retry logic to ingestion step (line ~312)
**Last Completed**: Task 3.5 — Schema validation for input records
**Blockers**: [none]
**Next Action**: Fix connection timeout in batch processor (src/pipeline/batch.py:89)
```

SESSION-NOTES.md:

```markdown
## Uncommitted Work

[none]

## Remaining Work Before Returning to Task List

1. Fix connection timeout in batch processor (pool exhaustion under load)
2. Add integration test for concurrent batch processing
3. Run full test suite to verify no regressions
4. Return to Task 4.1 — Add retry logic (line ~312 in tasks-data-pipeline.md)

> **Unclear path variant:** When the fix isn't known yet, replace the numbered steps with:
> `Path unclear - exploratory debugging. Will return to Task 4.1 — Add retry logic (line ~312)
> when resolved.`

## Additional Context

- Discovered timeout when batch size exceeds 1000 records (connection pool default is 10).
- Tried increasing pool size to 50, but underlying issue is sequential processing blocking connections.
- Best fix: switch to async batch processing with connection pool recycling.
```

## Task List Completion & Transition Format

**When work is complete and/or task list has been archived**, use this expanded format:

status-{name}.md while the WU is still active:

```markdown
## Active Work

**State:** Complete
**Last Completed**: [Task list name] (Tasks X-Y, archived)
**Blockers**: [none]
**Next Action:** archive-work-unit Step 1 — archive artifacts and retire the status file
```

If the work unit has already been archived, no active status file remains. SESSION-NOTES.md at
completion is minimal — accomplishment summary with commit hashes, archive path. Preserve any
Persistent Context entries that span work units; reset ephemeral sections.

## Post-Update Cleanup

After updating session state files, verify clean markdown. If SESSION-NOTES.md is gitignored, your linter
may skip it by default — pass the path explicitly or use an IDE-integrated linter.

## Push Sequence

**Push-ordering invariant.** When both worktree-push and notes-push fire, **worktree-push lands
first**. Notes attach to commits that must already exist on origin — reversing the order causes
notes-push to reference unpublished commits. Not configurable; enforced by the workflow ordering
below. See [Session Operations Strategy][session-ops] § Push Toggles for the underlying constraint.

### Worktree Push

Gated on `autonomy.value` (push-interlock) and `worktree.value.state`. Note that the worktree
slot was captured pre-step-3 — if step 3 fired a `chore(status): handoff` commit, the slot's
local-ahead count is one short of reality; account for that:

- `auto-push` autonomy: run `git push` when there's anything unpushed — `worktree.value.state
  === "local-ahead"` (probe baseline) OR step 3 fired a chore commit. No ask — autonomy is the
  approval.
- `auto-push` autonomy + `worktree.value.state` is `remote-ahead` / `diverged`: skip the push;
  surface in the handoff summary as `Reconcile required:` — manual rebase or merge needed before
  pushing (step 3's commit, if any, can't fast-forward in this state).
- `manual-commit` autonomy (default): skip the push action. The user pushes when ready. Surface
  unpushed commits in the handoff summary as a one-line note (`Worktree: N unpushed commit(s) on
  {branch}`) whenever there's anything unpushed (probe local-ahead OR step 3 chore commit).

### Notes Push

After worktree push (whether fired or skipped), run `arc sync` — resolves `syncPush.value.policy`:

```bash
arc sync
```

- **`always`**: saves and pushes in one step.
- **`prompt`**: saves, then asks before pushing. In non-interactive environments (CI, no TTY),
  degrades to `manual` with a warning rather than hanging on the prompt.
- **`manual`**: saves only; the user pushes later with `arc user push`.

For manual control outside of handoff (ad-hoc save, push, or force-push), `arc user save`,
`arc user push`, and `arc user push --force` remain available. In non-interactive or
confirmation-free reruns, `arc sync --yes` skips overwrite prompts.

**Error handling:** The CLI surfaces sync errors interactively — follow its guidance. Common cases:

- **Push rejected (non-fast-forward)** — CLI offers force-push or merge-rebase; choose per which
  side is authoritative.
- **Missing remote** — local save completed; push later when `origin` is configured.
- **Pull warning (local changes)** — CLI confirms before overwriting unsaved notes.

**Surface the outcome in the handoff summary.** After `arc sync` returns, the agent must report
whether the save and push succeeded — check the exit code and include a one-line result in the
end-of-session summary (e.g., "session state synced to remote" or "sync failed, state preserved
locally — re-run `arc sync` after resolving"). The CLI's interactive output is easy to miss when
scrolling or in non-TTY contexts; an explicit outcome line prevents the "work didn't land but
user thought it did" failure mode.

If save itself fails (empty user directory, filesystem permissions), the session state is only in
SESSION-NOTES.md on disk. Resolve the issue and re-run `arc user save`.

## Confirm Handoff

After updating the active status file (if any) and SESSION-NOTES.md, deliver a verbal summary to the user.
This is a quick confirmation for the human — the session state files are the durable artifacts.

**ARC session handoff complete** · `{branch-name}` · {clean | uncommitted changes}

**Sync:** {synced to remote | sync failed — re-run `arc sync` after resolving}

**Next session:** [Task list pointer (on-task-list) or freeform (off-task-list)]

**Conditional top-level sections** — prepend above `**Sync:**` when applicable:

- `worktree.value.state === "local-ahead"`:

  ```text
  **Worktree:** {ahead} unpushed commit(s) on `{branch}`.
  ```

- `worktree.value.state === "diverged"`:

  ```text
  **Reconcile required:** `{branch}` diverged from `origin/{branch}` ({ahead} ahead, {behind}
  behind). Manual rebase or merge needed before pushing.
  ```

- Status-file commit declined under manual-commit autonomy (step 3 stage-only path):

  ```text
  **Status file dirty, not committed** — next session will see the gap on first
  `arc status --session-init --json` read.
  ```

**Formatting guidance:**

- Mirrors the session-init orientation summary — bookend pattern. Confirm Handoff doesn't restate
  what got done (SESSION-NOTES, git log, task list, and status-file `**Last Completed:**` already
  carry it); the verbal output is operational confirmation, not a session retrospective.
- **Next session**: one line on-task-list (status file pointer); unbounded only when off-task-list
  — same bounding as session-init orientation Next Action.

[arc-methods-session]: ../../../methods/session-state.md
[dev-rules-arc]: ../../../../reference/constitution/DEV-RULES.ARC.md
[team-coordination]: ../../../../reference/strategies/arc/strategy-team-coordination.md
[session-ops]: ../../../../reference/strategies/arc/strategy-session-operations.md
