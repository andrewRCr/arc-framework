---
purpose: Capture session state so the next session can resume with full context — counterpart to session-init.
audience: agent
arc:
  methods:
    - session-state
  extensions:
    - pre-push-review
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
the workflow to refresh slots that the selected handoff path mutates.

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
| `active`                 | Active meta file resolution + sessionType (same shape as session-init)                                                |
| `head`                   | `{hash: string \| null}` — current HEAD short-hash. Re-read from probe-2 for the `Commit at Handoff` anchor           |
| `pushability`            | Pushability pre-check matrix for the worktree push leg                                                                |
| `restateCandidates`      | Structured payload backing the SESSION-NOTES restate filter — read from probe-1 (stable across meta-file commit)      |
| `inboxState`             | Routable-entry count + `housekeepNeeded` flag for the between-WUs housekeep offer; identity-scoped                    |
| `recommendedSummaryLine` | Pre-composed top-of-Confirm-Handoff line (`**Reconcile required:** ...` / `**Worktree:** N unpushed ...` / `null`)    |

**Slot freshness contract.** Probe-1 captures pre-path state. The active-WU meta-file commit and errand
checkpoint commit mutate `worktree`, `dirty`, and `head`; between-WUs housekeep may mutate `worktree`,
`dirty`, `head`, and `inboxState`. Re-read mutated slots from probe-2 to render post-path truth. Other slots
(`identity`, `branch`, `syncInterlock`, `active`, `user`, `pushability`, `restateCandidates`) remain stable
from probe-1.

**Identity absent** (`identity.identity === null`): Skip the notes-sync slot — notes operations
depend on identity for path resolution. Surface a warning in the handoff summary. Sessions without
identity cannot push notes.

**Probe failure fallback**: If the composite call fails, fall back to direct commands:
`git status --porcelain`, `git status -sb` (or `git rev-list --count`), `git config arc.identity`
/ `arc.role`. Note the degradation in the handoff summary.

Carry slot values forward to the steps that consume them — don't re-probe outside the documented
probe-1 / probe-2 points.

## Handoff Mode Dispatch

After probe-1, select one handoff path from `active.value.resolution` and `branch`:

- **Active-WU handoff** — `single` or `multiple`: follow [Active-WU Handoff Format](#active-wu-handoff-format).
  The path updates tracked WU state and per-WU SESSION-NOTES before syncing.
- **Errand-session handoff** — `none` + `branch` starts with `chore/`: follow
  [Errand-Session Handoff Path](#errand-session-handoff-path). The path checkpoints and pushes the current
  errand branch, with no meta file or SESSION-NOTES ceremony.
- **Between-WUs handoff** — `none` + non-`chore/` branch: follow
  [Between-WUs Handoff Path](#between-wus-handoff-path). The path has no active meta file, no per-WU
  SESSION-NOTES home, and no meta-file handoff commit. It reviews persistent context, offers housekeep when
  captures are pending, syncs, and confirms.

## What to Update

Session state is split across tracked project state and personal session state (per the
[session-state method][arc-methods-session] default — if your project overrides session-state,
follow the override instead):

- **Active meta file** (tracked) — project state for the active work unit:
  `meta-{name}.md` in `.arc/active/` for Full mode, `meta.md` in `.arc/active/`
  for Lite mode. Carries `**State:**`, `**Branch:**`, `**Task List:**`, `**Next Task:**`,
  `**Last Completed:**`, `**Blockers:**`, and `**Next Action:**`. Between work units or during
  planning cycles with no active WU, no tracked meta file exists.
- **SESSION-NOTES.md** (gitignored, `.arc/user/{identity}/<wu-name>/`) — per-WU session context:
  completed work, decisions, debugging insights, things tried. Replaced each handoff (not appended).
  Between work units, skip SESSION-NOTES entirely — there is no anchored WU subdir to write. Identity resolved
  from `git config arc.identity`; `<wu-name>` derived from the active meta filename (basename of
  `active.value.path`, strip `meta-` prefix and `.md` suffix) in the active-WU path.
- **WORKING-MEMORY.md** (gitignored, `.arc/user/{identity}/`) — cross-WU persistent context. Entries
  survive across handoffs, each carrying an explicit `_Remove when:_` trigger reviewed at each handoff
  (see WORKING-MEMORY entries guidance below).

> **Person-to-person handoff:** If handing off to a different developer (not just ending your
> own session), write SESSION-NOTES.md for someone with no prior context on this work and
> reassign task ownership via `(@name)` markers. See [Team Coordination
> Strategy][team-coordination] § Person-to-Person Task Handoff for the full protocol.

**Active-WU handoff** — active meta file and SESSION-NOTES.md session context. Use
[Active-WU Handoff Format](#active-wu-handoff-format).

**Errand-session handoff** — current `chore/<slug>` branch only. No active meta file, SESSION-NOTES write,
WORKING-MEMORY review, or housekeep offer; checkpoint and push the branch. Use
[Errand-Session Handoff Path](#errand-session-handoff-path).

**Between-WUs handoff** — no active meta file or SESSION-NOTES write. Review WORKING-MEMORY, route any durable
captures to existing surfaces (`USER-INBOX`, `WORKING-MEMORY`, ROADMAP / backlog artifacts as applicable), offer
housekeep when captures are pending, then sync + confirm. Use
[Between-WUs Handoff Path](#between-wus-handoff-path).

**When context changes** — capture working-directory paths or environment expectations in the active
meta file only when they change next-session orientation.

**Preserve persistent context** — `WORKING-MEMORY.md` carries cross-session entries with explicit
removal triggers. See the WORKING-MEMORY steps below for the preservation criterion and review cadence.

## Errand-Session Handoff Path

Use this path when `active.value.resolution === "none"` and `branch` matches `chore/<slug>`.

This path pauses the **current** in-flight errand only. Do not scan, summarize, clean up, or police any other
`chore/` branches here; session-init's Orient arm owns the in-flight errand sweep.

1. **Confirm the current errand branch** — derive `<slug>` from `branch` (`chore/<slug>`). If an active meta file
   resolved, use the active-WU path instead; an active WU always wins over branch-prefix heuristics. If the branch
   is detached or not `chore/<slug>`, this path does not apply.
2. **Checkpoint local progress** — inspect `dirty` / `git status`. If the tree is dirty, stage only
   errand-scoped changes. If unrelated or ambiguous changes are present, surface them before committing. If the
   tree is clean and no commits are local-only, skip the checkpoint commit and proceed to the push check.
3. **Commit the checkpoint when needed** — this is a temporary errand checkpoint, not a WU ceremony. Use raw
   `git commit` with the appropriate standalone context footer from [commit-footer][commit-footer]; do not write
   a meta file or SESSION-NOTES.

    ```text
    chore(errand): checkpoint <slug>

    Context: standalone (<kind>)
    ```

4. **Push the current errand branch** — push `chore/<slug>` so another machine can materialize/resume it. If
   upstream is absent, set it on this push; otherwise push the existing upstream.

    - **Extensions** · `#pre-push-review`: If `pre-push-review` appears in the active-extensions list
      (established at session init), load and execute its `.actions` before the push. Halt-on-fail surfaces an
      actionable message; user fix-and-retries or explicit-invoke bypasses. Otherwise, skip.

    ```bash
    git push -u origin chore/<slug>   # first push
    git push                         # upstream already exists
    ```

   If the push fails, keep the local checkpoint and surface that cross-machine resume is unavailable until the
   push succeeds. Do not remove the originating `USER-INBOX` entry; errand completion owns source cleanup.
5. **Refresh probe** — re-run the composite probe:

    ```bash
    arc status --session-handoff --json
    ```

   This is probe-2 for the errand-session path. Read updated `worktree`, `dirty`, `head`, and
   `recommendedSummaryLine` from probe-2.
6. **Run [Confirm Handoff](#confirm-handoff)**. Use the errand confirmation line and point the next session at
   materializing or resuming `chore/<slug>`.

## Between-WUs Handoff Path

Use this path when `active.value.resolution === "none"`.

1. **Review `WORKING-MEMORY.md`** — if identity resolved, apply the criterion in the WORKING-MEMORY
   entries guidance below. Remove entries whose triggers are met, AND entries whose information is now
   carried in tracked state. Surface removals in the handoff summary; do not silently rewrite. If identity
   is absent, skip user-state reads and surface the degraded state.
2. **Route durable handoff context** — if anything must survive the handoff, write it to an existing
   authoritative surface: `USER-INBOX` for deferred personal captures, `WORKING-MEMORY` for cross-WU
   persistent context, or ROADMAP / backlog artifacts when the project document is already the clear home.
   Do not create a per-WU SESSION-NOTES home or a placeholder marker.
3. **Offer housekeep when captures are pending** — if `inboxState.ok` and
   `inboxState.value.housekeepNeeded`, ask:
   `USER-INBOX has {routableCount} pending capture(s). Run arc-housekeep before handoff sync?`
   On acceptance, dispatch [Drain Inbox][drain-inbox] through `arc-housekeep`; treat this as a
   resolve-then-load subworkflow dispatch, not an inlined copy of the drain logic. On decline, carry the
   deferred housekeep advisory to Confirm Handoff. If `inboxState` failed, surface the degraded state and
   continue without an agent-side re-scan.
4. **Refresh probe** — after housekeep or WORKING-MEMORY edits, re-run the composite probe:

    ```bash
    arc status --session-handoff --json
    ```

   This is probe-2 for the between-WUs path. Read updated `worktree`, `dirty`, `head`, `inboxState`, and
   `recommendedSummaryLine` from probe-2; unchanged slots remain stable from probe-1. If nothing changed,
   the refresh is harmless and becomes the sync baseline.
5. **Run [Sync](#sync)**.
6. **Run [Confirm Handoff](#confirm-handoff)**. Use `session-init discovery / user direction` for
   **Next session** unless the user gave a concrete next action during handoff.

## Active-WU Handoff Format

Use this path when `active.value.resolution` is `single`, or after resolving a `multiple` result to one
active meta file.

Update session state files before ending session:

1. **Review `WORKING-MEMORY.md`** — apply the criterion in the WORKING-MEMORY entries guidance below.
   Remove entries whose triggers are met, AND entries whose information is now carried in tracked
   state (the criterion catches drift introduced by earlier sessions). Surface removals in the
   handoff summary; do not silently rewrite.
2. **Update the active meta file + commit** — advance
   `**Last Completed:**`, `**Next Task:**`, `**Next Action:**`, and any other load-bearing fields.
   Meta-file changes land as a dedicated `chore(arc): handoff — <position>` commit per
   [DEV-RULES.ARC][dev-rules-arc] § Meta-file commit shape — at handoff, the meta file is the
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
    - `planning <wu-name>` — on a draft-doc branch
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

    > [!CAUTION]
    > `commit-interlock` release — commit as `workflowCommit` with the composed message above.

    When the previous block staged a change, the new HEAD becomes the `**Commit at Handoff:**`
    value written in step 4. When no field cleared the skip threshold, nothing is staged and the
    commit is a no-op — step 4 carries the prior `Commit at Handoff:` value forward.

    Contributors (`arc.role = contributor`) skip the commit — their personal active meta file at
    `.arc/user/{identity}/active/meta-{name}.md` is gitignored, so the field update lands
    without staging.
3. **Refresh probe** — re-run the composite probe to pick up post-step-2 state:

    ```bash
    arc status --session-handoff --json
    ```

    Probe-2 carries the post-step-2 values for `worktree`, `dirty`, `head`, and
    `recommendedSummaryLine`. Step 4 and Confirm Handoff read those four slots from probe-2; all
    other slots remain stable from probe-1.

    When step 2 didn't fire a commit (no field cleared the skip threshold), probe-2's mutated
    slots are identical to probe-1's — the second invocation is harmless redundancy. The
    workflow doesn't branch on whether a commit fired.
4. **Write SESSION-NOTES** per the guidance below. Record `**Commit at Handoff:**` from
   probe-2's `head.value.hash` — that's the post-step-2 HEAD whether or not step 2 committed.

**Update the active meta file** (tracked project state, if an active WU exists):

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

**State:** Active
**Branch**: [current branch name, e.g., feat/config-parser]
**Task List**: [filename of task list, e.g., tasks-config-parser.md]
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

_Content discipline: the meta file is a project pointer, not session narrative. Keep each field to one
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

**Update `.arc/user/{identity}/<wu-name>/SESSION-NOTES.md`** (per-WU session context — gitignored; active-WU
path only). Derive `<wu-name>` from the active meta filename (basename of `active.value.path`, strip `meta-`
prefix and `.md` suffix). Between-WUs handoff skips this section entirely.

**Audience:** The next session's agent loading from cold context. They already have tracked state —
git log, task list, meta file, commit bodies, `notes-*.md`, PRD, constitution, strategies. Write
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

**Working On:** meta-{name}.md
<!--
Markers:
  [none]                        — no active work
  [planning: {category}/{name}] — planning cycle, no WU yet
  meta-{name}.md                — normal case, file reference
-->

**Commit at Handoff:** `{{short-hash}}`
<!--
  **Session Type:** {planning | execution | integration}
  Optional override; absent → inferred from tracked state. Set only when the next session's
  intent diverges from what the active meta file implies. Case-insensitive. Invalid value →
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
```

**Per-section guidance:**

- **Working On / Session Type override:** Marker vocabulary in the template. `Session Type` is
  optional; absent → session-init infers. Set only when the next session's intent diverges from
  what the active meta file implies (e.g., status points at execution, next session will plan
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

- **WORKING-MEMORY entries:** Cross-WU persistent context — entries that survive across handoffs
  (and WU boundaries) at `.arc/user/{identity}/WORKING-MEMORY.md`. Each needs an explicit removal
  trigger (not tied to full work unit completion). Same filter as above.

    - **Passes:** forward-looking constraints (terminology for an unlanded rename), un-codified
      meta-conventions, parking references to uncommitted work visible in `git status`.
    - **Fails:** mechanism decisions already in a plan doc's § Resolved Decisions, rules already
      in a strategy doc, behavioral guidance already in DEV-RULES.
    - **Anti-pattern (planning sessions):** writing an entry for every mechanism decision
      resolved in the plan doc — WORKING-MEMORY is not a substitute for § Resolved Decisions.
    - **Anti-pattern (future-WU drift):** activation-audit reminders inside a backlog
      `draft-*.md` for an unactivated WU. Write them into the plan doc itself; the activating
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

meta-data-pipeline.md:

```markdown
## Work Unit Metadata

**State:** Active
**Branch**: feat/data-pipeline
**Task List**: tasks-data-pipeline.md
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

meta-{name}.md while the WU is still active:

```markdown
## Work Unit Metadata

**State:** Complete
**Last Completed**: [Task list name] (Tasks X-Y, archived)
**Blockers**: [none]
**Next Action:** archive-work-unit Step 1 — archive artifacts and retire the meta file
```

If the work unit has already been archived, no active meta file remains. The per-WU SESSION-NOTES
subdir is retired alongside the WU (`arc user close` handles this); WORKING-MEMORY.md persists
unchanged across the archive boundary — its entries' eviction triggers handle cross-WU lifecycle.

## Post-Update Cleanup

After updating session state files, verify clean markdown. If SESSION-NOTES.md is gitignored, your linter
may skip it by default — pass the path explicitly or use an IDE-integrated linter.

## Sync

Errand-session handoff bypasses this section: it performs the current `chore/<slug>` branch push inline and
writes no session state files.

First, run the [Same-session finalize pass](#same-session-finalize-pass) — a no-op unless this session opened an
unfinalized PR. Running it before sync lets a re-anchored post-merge note ride the sync push.

For active-WU and between-WUs handoff, sync is gated on `syncInterlock.value`. `arc sync` (the orchestrator) owns
the matrix dispatch
internally — push-ordering invariant, worktree+notes coherence, notes-vs-worktree blocking,
and partial-push recovery all live in the CLI, not in workflow prose. See [Session Operations
Strategy][session-ops] § Push Toggles for the underlying model.

- **`on-handoff`** (default) / **`on-workflow`** — auto-invoke and consume the structured
  output. Both values fire sync at handoff.

    - **Extensions** · `#pre-push-review`: If `pre-push-review` appears in the active-extensions
      list (established at session init), load and execute its `.actions` before invoking sync.
      Halt-on-fail surfaces an actionable message; user fix-and-retries or explicit-invoke
      bypasses. Otherwise, skip.

    > [!CAUTION]
    > `sync-interlock` release — auto-invoke `arc sync`:

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

After completing the selected handoff path and sync step, deliver a verbal summary to the user. This is
a quick confirmation for the human — the session state files and routed captures are the durable artifacts.

**ARC session handoff complete** · `{branch-name}` · {clean | uncommitted changes}

When `worktree.value.identity.kind === "linked"`, insert `` · `worktree: {identity.path}` `` into the header
after the branch — naming the non-primary worktree the session occupies. Omit entirely in the primary worktree.

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

**Housekeep:** [between-WUs only, when pending captures remain, housekeep was declined, or `inboxState` failed]

**Errand:** [errand-session only: checkpoint commit hash or "no new commit"; push result for `chore/<slug>`]

**Next session:** [Task list pointer (on-task-list), freeform (off-task-list), materialize/resume `chore/<slug>`
for errand-session, or `session-init discovery / user direction` between WUs]

**Conditional top-level section** — when `recommendedSummaryLine` is non-null, prepend it
verbatim above `**Sync:**`. Read from `arc sync --json`'s envelope when sync ran
(`syncInterlock.value` is `"on-handoff"` or `"on-workflow"` and identity present); read from
probe-2 otherwise (manual mode or identity absent). Both surfaces compose from canonical state
— no agent-side counting or dispatch.

**Formatting guidance:**

- Mirrors the session-init orientation summary — bookend pattern. Confirm Handoff doesn't restate
  what got done (SESSION-NOTES, git log, task list, meta-file `**Last Completed:**`, and routed captures already
  carry it); the verbal output is operational confirmation, not a session retrospective.
- **Next session**: one line on-task-list (meta file pointer); unbounded only when off-task-list
  — same bounding as session-init orientation Next Action.
- Errand-session confirmations use `**Errand:**` instead of `**Sync:**`; they report only the checkpoint/push
  result for the current branch and do not summarize other `chore/` branches.

## Same-session finalize pass

Finalize this session's PRs that merged outside an attended ceremony. A no-op unless this session opened a PR
that has not been finalized — resolve this session's candidate branches (the WU or `chore/<slug>` branches whose
PRs this session opened) and return when there are none.

Poll each candidate once — a single `gh pr view <branch> --json state,mergedAt`, never a wait-loop (never block
on CI) — then dispatch:

- **merged-clean** → eager teardown. Each step is presence-guarded (safe to re-run):
    - switch off the merged branch when checked out: `git switch <base-branch>`;
    - delete the local branch, merged-only-safe: `git show-ref --quiet refs/heads/<branch> && git branch -d
      <branch>`;
    - prune the stale remote-tracking ref: `git fetch --prune origin` (delete-on-merge typically removed the
      remote branch already);
    - remove any ephemeral worktree: `git worktree list --porcelain | grep -q '<path>' && git worktree remove
      <path>`;
    - for a `chore/<slug>` errand candidate, drop the slug-matched `USER-INBOX` line (idempotent — a no-op when
      the errand's own completion already removed it);
    - run the [Notes-sync leg](#notes-sync-leg) to re-anchor the saved user note onto the merged HEAD.
- **failed / blocked** → surface loudly, for both the manual- and auto-merge lanes.
- **still-pending** → hand to the session-init completion sweep; no action this session.

## Notes-sync leg

A reusable completion step — invoked by reference from the paths that finalize a merge landing outside an
attended ceremony, at merge completion, right after the WORKING-MEMORY / inbox maintenance that rides a work
unit's close. It is not part of the linear handoff flow above.

A post-merge base pull / fast-forward advances HEAD past the commit the user note was saved on, leaving the note
reachable from an ancestor of HEAD but not from HEAD itself (`arc user status` reports an `ancestor` freshness
state). Re-anchor it so the saved note travels with the merged state:

```bash
arc user save        # write the user note onto current HEAD
```

Then confirm HEAD carries the note — `arc user status` reports `current-head`, not `ancestor`. Re-running is
safe: `arc user save` is idempotent against an already-current note, so the leg no-ops when HEAD already carries
it.

This step is only the wiring — call the sync at completion, leave HEAD fresh. The merge-coherence correctness it
relies on (idempotent removal-tombstone resolution, projection-aware status, `ancestor`-freshness recognition)
lives behind `arc user save` / `arc user sync`.

**Identity absent** (`identity.identity === null`): skip the leg — user notes are identity-scoped, so there is no
note to anchor.

[arc-methods-session]: ../../../methods/session-state.md
[commit-footer]: ../../../methods/commit-footer.md
[drain-inbox]: ../supplemental/drain-inbox.md
[dev-rules-arc]: ../../../../system/rules/DEV-RULES.ARC.md
[team-coordination]: ../../../../reference/strategies/arc/strategy-team-coordination.md
[session-ops]: ../../../../reference/strategies/arc/strategy-session-operations.md
