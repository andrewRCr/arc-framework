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
the session-init pattern. This is **probe-1**; a second invocation (**probe-2**) fires later in
the workflow to refresh slots that the status-file commit mutates.

```bash
arc status --session-handoff --json
```

| Field                    | Contents                                                                                                              |
|--------------------------|-----------------------------------------------------------------------------------------------------------------------|
| `identity`               | `{identity, role}` — either may be `null`. `identity === null` short-circuits the notes-sync slot                     |
| `branch`                 | Current branch name; `null` on detached HEAD. Resolved at handler boundary; canonical for the Confirm Handoff header  |
| `dirty`                  | `{state: clean / dirty, fileCount}`. Re-read from probe-2 for the SESSION-NOTES "Uncommitted Work" section            |
| `worktree`               | Worktree sync vs `origin/<branch>` — same state vocabulary as session-init. Re-read from probe-2 for unpushed counts  |
| `user`                   | Notes sync state (`value.state`: clean / remote-ahead / conflict / disabled / remote-unavailable)                     |
| `syncInterlock`          | `{value, source}` — gates handoff auto-invoke of `arc sync` (`on-handoff`/`on-workflow` fire; `manual` skips)         |
| `active`                 | Active status file resolution + sessionType (same shape as session-init)                                              |
| `head`                   | `{hash: string \| null}` — current HEAD short-hash. Re-read from probe-2 for the `Commit at Handoff` anchor           |
| `pushability`            | Pushability pre-check matrix for the worktree push leg                                                                |
| `restateCandidates`      | Structured payload backing the SESSION-NOTES restate filter — read from probe-1 (stable across step 3)                |
| `recommendedSummaryLine` | Pre-composed top-of-Confirm-Handoff line (`**Reconcile required:** ...` / `**Worktree:** N unpushed ...` / `null`)    |

**Slot freshness contract.** Probe-1 captures pre-step-3 state. The status-file commit at step 3
mutates `worktree`, `dirty`, and `head`; those slots must be re-read from probe-2 to render
post-step-3 truth. Other slots (`identity`, `branch`, `syncInterlock`, `active`, `user`,
`pushability`, `restateCandidates`) are stable from probe-1.

**Identity absent** (`identity.identity === null`): Skip the notes-sync slot — notes operations
depend on identity for path resolution. Surface a warning in the handoff summary. Sessions without
identity cannot push notes.

**Probe failure fallback**: If the composite call fails, fall back to direct commands:
`git status --porcelain`, `git status -sb` (or `git rev-list --count`), `git config arc.identity`
/ `arc.role`. Note the degradation in the handoff summary.

Carry slot values forward to the steps that consume them — don't re-probe outside the documented
probe-1 / probe-2 points.

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
3. **Update the active meta file + commit** (if an active WU exists) — advance
   `**Last Completed:**`, `**Next Task:**`, `**Next Action:**`, and any other load-bearing fields.
   Meta-file changes land as a dedicated `chore(arc): handoff — <position>` commit per
   [DEV-RULES.ARC][dev-rules-arc] § Status-file commit shape — at handoff, the meta file is the
   entire staged change.

    **Skip threshold.** Update fields only when changes are materially relevant to next-session
    orientation. Test: "Would the next session do anything different at step 0 with this change?"
    If no, skip — even when a field is technically different. Concrete signals to update:

    - Task advanced (Last Completed / Next Task changed)
    - Blockers added or resolved
    - Branch / Spec / Task List field changed
    - Next Action describes work that didn't exist before

    Below threshold (skip): minor rephrasing of Last Completed / Next Action with no semantic
    change, cosmetic reorderings, restating the same Next Action in different words.

    **Skill invocation is the approval.** `/arc-handoff` is user-initiated; the invocation grants
    approval for the workflow's bundled actions, including the `chore(arc): handoff` commit.
    No separate per-commit prompt fires under either push-interlock mode — push behavior is gated
    by `arc sync` internally (see § Sync), where remote-side consequences justify granular gating.
    Stage the meta file and lint it (catches authoring errors before the chore-commit lands):

    ```bash
    git add <resolved-meta-file-path>
    <project markdown lint on the staged file>  # fix + re-stage on failure
    ```

    **Compose the commit message** from the codified subject + body templates. Position-string
    selection is field-delta driven (minimal judgment):

    - `Phase N complete, next: Task X.Y` — last-completed task closes a phase boundary
    - `next: Task X.Y[.z]` — within a phase (task ID encodes phase position)
    - `between work units` — no active WU
    - `planning <wu-name>` — on a plan-doc branch
    - `work unit complete, next: integrate` — all tasks complete; integration pending
    - `off-task-list — <brief>` — off-task-list work mid-WU

    Body template:

    ```text
    chore(arc): handoff — <position>

    Last Completed: <prev> → <curr>
    Next Task: <prev> → <curr>
    [State: <value> (changed | unchanged)]
    [Blockers: <delta if changed>]

    Context: meta-<wu-name>.md (handoff)
    ```

    `Last Completed` + `Next Task` lines always present; `State` line included only when value
    changed; `Blockers` line included only when delta exists. Prev-value derived from
    `git show <Commit at Handoff>:<meta-path>` (the hash from SESSION-NOTES); curr-value from
    staged content.

    **Subject-length guard.** Codified position templates fit under the 72-char hook limit with
    typical WU/task names. Long WU names (>~30 chars) may force shortened forms — convention for
    fallback: trim WU name to its last segment.

    Then invoke `workflowCommit` with the composed message.

    When the previous block staged a change, the new HEAD becomes the `**Commit at Handoff:**`
    value written in step 5. When no field cleared the skip threshold, nothing is staged and the
    commit is a no-op — step 5 carries the prior `Commit at Handoff:` value forward.

    Contributors (`arc.role = contributor`) skip the commit — their personal active meta file at
    `.arc/user/{identity}/active/meta-{name}.md` is gitignored, so the field update lands
    without staging.
4. **Refresh probe** — re-run the composite probe to pick up post-step-3 state:

    ```bash
    arc status --session-handoff --json
    ```

    Probe-2 carries the post-step-3 values for `worktree`, `dirty`, `head`, and
    `recommendedSummaryLine`. Steps 5 and Confirm Handoff read those four slots from probe-2; all
    other slots remain stable from probe-1.

    When step 3 didn't fire a commit (no field cleared the skip threshold), probe-2's mutated
    slots are identical to probe-1's — the second invocation is harmless redundancy. The
    workflow doesn't branch on whether a commit fired.
5. **Write SESSION-NOTES** per the guidance below. Record `**Commit at Handoff:**` from
   probe-2's `head.value.hash` — that's the post-step-3 HEAD whether or not step 3 committed.

**Update the active status file** (tracked project state, if an active WU exists):

<!-- arc:if team.mode == true -->
> **Team mode:** The active meta file represents work-unit state, not personal state. "Next Task"
> should reflect the WU's overall next incomplete task, not your personal next task (which
> is determined by `(@name)` markers at session-init). When multiple developers are active, the
> last committer's update wins — this is expected and resolved at session-init via `(@name)`
> filtering. Before writing, check whether the active meta file changed since session-init
> (`git diff <resolved-meta-file-path>`) — if another developer updated it mid-session,
> incorporate their changes rather than silently overwriting.
<!-- arc:endif -->

```markdown
## Work Unit Metadata

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

_Workflow step pointer: When the next action resumes a lifecycle workflow (integrate, archive), use
the literal format `<workflow-name> Step <N> — <description>` — e.g., "integrate-work-unit Step 7 —
push and create PR". The kebab-case workflow name matches the workflow filename without `.md`. Both
the pre-commit validator (RULE 7 freshness check) and session-init's sessionType inference key on
this prefix. Task-list-driven workflows (process-task-loop) don't need this; the task list checkbox
state is the pointer._
```

**Update `.arc/user/{identity}/SESSION-NOTES.md`** (personal session context — gitignored):

**Audience:** The next session's agent loading from cold context. They already have tracked state —
git log, task list, status file, commit bodies, `notes-*.md`, PRD, constitution, strategies. Write
only what they can't derive from any of that. Volume is a side effect, not a target.

**Filter pipeline — apply both passes:**

**Pass 1 — Cross-check `restateCandidates`.** Probe slot carries `commitsSinceHandoff`,
`tasksClosedSinceHandoff`, and `noteFileChangesSinceHandoff` for this session. If candidate content
paraphrases an entry, omit. Mechanical step — array-driven, not judgment. When the soft signal
"baseline unknown" fires, skip Pass 1 and rely on Pass 2.

**Pass 2 — 3-criterion filter on the residual:**

1. **Not in any durable tracked source.** PRD, strategy, constitution, plan docs, ADRs — those are
   authoritative; duplicating creates shadow copies that drift.
2. **Acted on at step 0.** Orientation-relevant — changes what the next session does or checks when
   it loads. Not a retrospective observation you "want on record."
3. **Costly if missing.** Re-deriving from tracked state in 30 seconds is not rework; a
   misinterpretation costing an hour of re-debugging is.

If any criterion fails, omit. Empty sections write `[none]`.

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

**Per-section guidance:**

- **Working On / Session Type override:** Marker vocabulary in the template. `Session Type` is
  optional; absent → session-init infers. Set only when the next session's intent diverges from
  what the active status file implies (e.g., status points at execution, next session will plan
  a separate concern).
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
- **Additional Context:** Debugging insights, decisions not in tracked state, things tried and
  ruled out, observed risks, "currently mid-X with concrete next action Y" mid-task stops.
  Filter applies — empty is normal.

- **Persistent Context:** Entries that survive across handoffs. Each needs an explicit removal
  trigger (not tied to full work unit completion). Same filter as above.

    - **Passes:** forward-looking constraints (terminology for an unlanded rename), un-codified
      meta-conventions, parking references to uncommitted work visible in `git status`.
    - **Fails:** mechanism decisions already in a plan doc's § Resolved Decisions, rules already
      in a strategy doc, behavioral guidance already in DEV-RULES.
    - **Anti-pattern (planning sessions):** writing an entry for every mechanism decision
      resolved in the plan doc — Persistent Context is not a substitute for § Resolved Decisions.
    - **Anti-pattern (future-WU drift):** activation-audit reminders inside a backlog
      `plan-*.md` for an unactivated WU. Write them into the plan doc itself; the activating
      session sees them naturally.

    Review at each handoff: remove entries whose triggers are met, AND entries whose information
    is now carried in tracked state.

**Stay-out list — when you notice yourself writing one of these, delete it:**

- Forward-looking content the next session will read when they get there (phase previews,
  upcoming-task summaries, "things NOT to re-do" lists).
- Process narration (debugging steps, mid-task discoveries, tooling gotchas). Codify durable
  lessons in a strategy or QUICK-REFERENCE — not here.
- Explanatory paragraphs where the template expects whitespace. Empty sections stay empty.

(Restating tracked content is the most common failure but already excluded by Pass 1 — see the
filter pipeline above for the full case.)

## Handoff Examples

**Example 1: Off-task-list with known path back**

status-data-pipeline.md:

```markdown
## Work Unit Metadata

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
## Work Unit Metadata

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

## Sync

Gated on `syncInterlock.value`. `arc sync` (the orchestrator) owns the matrix dispatch
internally — push-ordering invariant, worktree+notes coherence, notes-vs-worktree blocking,
and partial-push recovery all live in the CLI, not in workflow prose. See [Session Operations
Strategy][session-ops] § Push Toggles for the underlying model.

- **`on-handoff`** (default) / **`on-workflow`** — auto-invoke and consume the structured
  output. Both values fire sync at handoff.

    - **Extensions** · `#pre-push-review`: If `pre-push-review` appears in the active-extensions
      list (established at session init), load and execute its `.actions` before invoking sync.
      Halt-on-fail surfaces an actionable message; user fix-and-retries or explicit-invoke
      bypasses. Otherwise, skip.

    ```bash
    arc sync --json
    ```

  The orchestrator probes worktree state, notes state, `push_interlock`, and `notes_push`;
  routes the resulting matrix cell through `runPairedPush` (paired) or single-leg primitives
  (worktree-only, notes-only, notes-blocked, save-only, prompt). Worst-outcome exit code;
  itemized leg outcomes in the JSON envelope's `cell`, `worktree`, `notes`, `exitCode`,
  optional `reconcile`, and `recommendedSummaryLine` fields. Surface the result per § Confirm
  Handoff.

- **`manual`** — skip the auto-invoke. The user runs `arc sync` (or single-leg commands) when
  ready. Probe-2's `recommendedSummaryLine` carries the unpushed / Reconcile surface (see §
  Confirm Handoff).

**Identity absent** (`identity.identity === null`): skip the auto-invoke regardless of
`syncInterlock.value` — `arc sync` requires identity for the notes leg. Probe-2's
`recommendedSummaryLine` still composes from worktree state.

## Confirm Handoff

After updating the active status file (if any) and SESSION-NOTES.md, deliver a verbal summary to the user.
This is a quick confirmation for the human — the session state files are the durable artifacts.

**ARC session handoff complete** · `{branch-name}` · {clean | uncommitted changes}

**Sync:** one of (read from `arc sync --json`'s envelope when sync ran; otherwise per the
skip arms):

- `synced to remote` — sync ran, at least one leg has `action: "push"` with
  `result: "success"` (worktree, notes, or both).
- `saved locally — no remote push fired` — sync ran with `exitCode: 0` but no leg pushed
  (save-only cell, notes-blocked path, or every leg `noop`/`skipped`/`blocked`).
- `sync failed — re-run \`arc sync\` after resolving` — sync ran and returned non-zero.
- `skipped (sync_interlock: manual). Run \`arc sync\` when ready.` — auto-invoke skipped per
  config.
- `skipped (no identity). Configure \`arc.identity\` to enable notes sync.` —
  identity-absent fallback.

**Next session:** [Task list pointer (on-task-list) or freeform (off-task-list)]

**Conditional top-level section** — when `recommendedSummaryLine` is non-null, prepend it
verbatim above `**Sync:**`. Read from `arc sync --json`'s envelope when sync ran
(`syncInterlock.value` is `"on-handoff"` or `"on-workflow"` and identity present); read from
probe-2 otherwise (manual mode or identity absent). Both surfaces compose from canonical state
— no agent-side counting or dispatch.

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
