# Workflow: Session Handoff

**Audience:** Agent-executed — your agent follows this to capture session state.

**Purpose**: Capture session state so the next session can resume with full context. This is the counterpart to
[session initialization][session-init] — together they implement P5 (Context Preservation) at session boundaries.

**When to use**: User-triggered at the end of a session, or when transitioning between work contexts.

**Design context**: This workflow is optimized for agents with ephemeral context — capturing state that would
otherwise be lost when the session ends. Agents with persistent memory may need lighter handoff ceremonies; the
principle (state must be recoverable by a new session) still applies. The session state mechanism is overridable
via [`arc-methods.md` § session-state][arc-methods-session].

**Method dependency (load on first reference):** This workflow references one arc-method. Load the relevant
section of [`arc-methods.md`][arc-methods] — check `.override` first; use `.default` if no override is
configured.

- [session-state][arc-methods-session] — reading and writing session state

## Handoff Protocol

### Pre-Update Verification

**Before writing the handoff, verify actual state:**

1. `git status` — clean vs uncommitted changes
2. `git log --oneline -10` — capture committed work
3. `git rev-parse --short HEAD` — record commit anchor for SESSION-NOTES.md staleness detection
4. Task list file — verify marked checkboxes reflect actual completion (maintainer only — contributors
   skip this)
5. **Working directory** — if it changed during the session, update paths in the active status file
   if one exists

> **Contributor role (`arc.role = contributor`):** Contributors write SESSION-NOTES.md and save
> to git notes (same as maintainers), but skip project-level active status-file work — items
> 4–5 in the pre-handoff checks above, and steps 4–5 in the handoff format below. Contributors
> don't manage the project work pipeline — proceed directly to the SESSION-NOTES.md update, git
> notes save, and confirmation.

### What to Update

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

**Preserve persistent context** — The `## Persistent Context` section in SESSION-NOTES.md carries
cross-session constraints that tracked state does not yet carry (forward-looking constraints,
un-codified meta-conventions, parking references). Each entry has an explicit removal trigger.
During handoff, rewrite ephemeral sections (Completed Work, Remaining Work, Additional Context)
but preserve persistent context entries whose triggers haven't been met AND which still satisfy
the criterion (see **Persistent Context** under "What to include" below). Remove entries whose
triggers are met OR whose information is now carried in tracked state.

### Comprehensive Handoff Format

Update session state files before ending session:

1. **Review `## Persistent Context`** — apply the criterion in the Persistent Context entry
   below. Remove entries whose triggers are met, AND entries whose information is now carried in
   tracked state (the criterion catches drift introduced by earlier sessions). Surface removals in
   the handoff summary; do not silently rewrite.
2. **Check working directory context** — if it changed during the session, update paths in the
   active status file if one exists.
3. **Write SESSION-NOTES `**Working On:**`** using the marker vocabulary established in the
   SESSION-NOTES template:
    - `status-{name}.md` — normal case, file reference
    - `[none]` — no active work
    - `[planning: {category}/{name}]` — planning cycle, no WU yet
    - `[between work units]` — between activation and archive of adjacent WUs
4. **Update the active status file** (if an active WU exists) — advance `**Last Completed:**`,
   `**Next Task:**`, `**Next Action:**`, and any other fields to reflect post-commit state. See
   the template block below.
5. **Safety-check commit** — if the active status file is dirty at this point (either the
   task-commit path missed staging a prior update, or step 4 produced handoff-time edits), commit
   it now as a standalone maintenance commit. No ask — handoff invocation is the approval:

    ```bash
    git add <resolved-status-file-path>
    git commit -m "docs(arc): update work-unit status

    Context: maintenance (atomic / no associated task list)"
    ```

    The new HEAD becomes the `**Commit at Handoff:**` value written in step 6. Most handoffs skip
    this — [DEV-RULES.ARC][dev-rules-arc] § Work status accuracy makes commit-time primary.
    Contributors (`arc.role = contributor`) skip this step — no project-level status file to
    commit.
6. **Write SESSION-NOTES** per the guidance below. Record `**Commit at Handoff:**` from current
   HEAD (post-step-5 if a commit was made).

**Update the active status file** (tracked project state, if an active WU exists):

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

**Long-session bias — resist it.** The pattern this filter exists to catch: long sessions
accumulate rich context, the agent reaches handoff, and an "I don't want to lose this" impulse
drives verbose preservation. Re-read the filter. Tracked state catches more than it feels like it
does at end-of-session. Duplication here adds startup noise for the next session without adding
signal.

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

## Completed Work

[Committed work — one line per commit: hash + outcome. See "Committed work" below.]
[Uncommitted work — commit-level detail. See "Uncommitted work" below.]

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

**Completed Work — committed work (default):** One line per commit: hash + outcome. Nothing more.

- ✅ `a1b2c3d` — Task 3.5: Schema validation for input records
- ✅ `e4f5g6h` — Tasks 3.6–3.7: Batch ingestion error handling

The commit body already documents what changed, why, and the design decisions — that's what
`git log` is for. Restating it in SESSION-NOTES is the most common noise pattern. Trust the
commit body.

**Completed Work — uncommitted work (exception):** When documenting uncommitted work, use
commit-level granularity — the next session needs enough detail to recreate proper atomic
commits from `git diff`:

- ✅ Task 3.2.1: Added input validation to config parser (src/config.py, src/validators.py) —
  rejects malformed YAML
- ✅ Task 3.2.2: Updated API response schema (api/v2/schemas.py:45–67) — added nullable fields
- ✅ Incidental: Fixed broken cross-reference in workflow doc (session-init.md)

Map accomplishments to logical commits (what changed, which files), include task numbers for
`Context:` footers, note incidental work separately from task list work.

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

Review at each handoff: remove entries whose triggers are met, AND entries whose information
is now carried in tracked state.

**Anti-patterns — omit by name.** When you notice yourself writing one of these, delete it and
trust the tracked source:

- ❌ **Commit-by-commit retrospective narration.** "Commit `abc123` delivered Task 1.3 as a
  full-file sweep because mid-batch discovery surfaced 16 references…" The commit body is
  exactly this. Leave it there.
- ❌ **Phase preview describing upcoming tasks.** "Task 2.2 creates the template, 2.3 adds the
  Working On field, 2.4 removes the Status header…" The task list is exactly this. The next
  session reads it when they get there, not at step 0.
- ❌ **Design-decision retrospective already in a commit body or notes file.** If the decision
  is in a commit or `notes-*.md § Consequences`, cross-reference it at most — don't restate it.
- ❌ **Session-retrospective incidentals.** "Table-width math was tight; commit body length
  warnings fired twice; markdown-table-prettify has a stdout gotcha." Process observations,
  not next-session context. If one becomes a durable lesson, codify it in a strategy or
  QUICK-REFERENCE — not SESSION-NOTES.
- ❌ **"Things NOT to re-do" lists** mirroring decisions already captured elsewhere. Defensive
  duplication. Tracked state will surface what the next session needs.
- ❌ **Explanatory paragraphs where the template expects whitespace.** An empty Persistent
  Context section is fine as empty. Don't write prose explaining why it's empty.
- ❌ **Restating committed content.** If it's in a committed file (WU status file, task list,
  commit message, `notes-*.md`), don't restate it here. The next session reads tracked state
  first; SESSION-NOTES is the delta.

**Minimum viable SESSION-NOTES — what belongs here:** If it doesn't fit one of these, it
probably doesn't belong:

- Things tried that didn't work (not yet captured in a commit or notes file)
- Decisions not captured in tracked state
- Observed risks
- "Currently mid-X with concrete next action Y" when stopping mid-task

### Handoff Examples

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
## Completed Work

- ✅ Task 3.5: Added schema validation for input records
- ⚠️ Discovered connection timeout during integration testing

## Remaining Work Before Returning to Task List

1. Fix connection timeout in batch processor (pool exhaustion under load)
2. Add integration test for concurrent batch processing
3. Run full test suite to verify no regressions
4. Return to Task 4.1 — Add retry logic (line ~312 in tasks-data-pipeline.md)

> **Unclear path variant:** When the fix isn't known yet, replace the numbered steps with:
> `Path unclear - exploratory debugging. Will return to Task 4.1 — Add retry logic (line ~312)
> when resolved.`

## Additional Context

- Timeout occurs when batch size exceeds 1000 records (connection pool default is 10)
- Tried increasing pool size to 50, but underlying issue is sequential processing blocking connections
- Best fix: switch to async batch processing with connection pool recycling
```

**Example 2: Preparatory work before starting task**

status-api-documentation.md:

```markdown
## Active Work

**State:** In Progress
**Branch**: technical/api-documentation
**Task List**: .arc/active/technical/tasks-api-documentation.md
**Next Task**: Task 3.1 — Document authentication endpoints (line ~203)
**Last Completed**: Tasks 2.3-2.4 — Query parameter and response format sections
**Blockers**: [none]
**Next Action**: Review auth middleware source before documenting Task 3.1 endpoints
```

SESSION-NOTES.md:

```markdown
## Completed Work

- ✅ Task 2.3: Query parameter documentation (committed a1b2c3d)
- ✅ Task 2.4: Response format documentation (committed a1b2c3d)

## Additional Context

**Pre-task review needed:**

1. Auth middleware has undocumented rate limiting behavior — need to read source before documenting
2. Token refresh flow has edge case when refresh token expires mid-request
```

### Task List Completion & Transition Format

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

### Post-Update Cleanup

After updating session state files, verify clean markdown. If SESSION-NOTES.md is gitignored, your linter
may skip it by default — pass the path explicitly or use an IDE-integrated linter.

### Save to Git Notes

After writing SESSION-NOTES.md, save the user directory to git notes and push based on the
`user.sync_push` setting. **Per-developer override:** `git config arc.sync_push` takes
precedence over `arc-config.yml` when set — check this first.

- **`always`** (solo default): save and push in one step:

    ```bash
    arc sync
    ```

- **`prompt`** (team default): save first, then ask the user whether to push:

    ```bash
    arc user save
    # then ask — if yes:
    arc user push
    ```

- **`manual`**: save only — user pushes when ready:

    ```bash
    arc user save
    ```

**Error handling:** The CLI surfaces sync errors interactively — follow its guidance:

- **Push rejected (non-fast-forward):** Remote notes diverged from local. The CLI offers
  force-push (overwrite remote) or pull-first (overwrite local). Choose based on which
  version is authoritative. This commonly happens when the same developer works from two
  machines without syncing, or in team mode when two developers share an identity by mistake.
- **Missing remote:** No `origin` configured. Session state is saved locally via `arc user
  save` — push is a convenience for portability. The local save still happened; push later
  when a remote is available.
- **Pull warning (local changes):** When pulling would overwrite unsaved local notes, the CLI
  confirms before proceeding. The pre-load backup (`.pre-load-backup.json`) preserves the
  prior state if needed.

If save itself fails (empty user directory, filesystem permissions), the session state is
only in SESSION-NOTES.md on disk. Resolve the issue and re-run `arc user save`.

### Confirm Handoff

After updating the active status file (if any) and SESSION-NOTES.md, deliver a verbal summary to
the user. This is a quick
confirmation for the human — the session state files are the durable artifacts.

**ARC session handoff complete** · `{branch-name}` · {clean | uncommitted changes}

**Session summary:**

- [What was accomplished — bullet per logical unit of work]
- [Include commit hashes for committed work]

**Uncommitted work:**

- [Files/changes with logical commit grouping]

**Next session:** [What comes next per the active status file, or next-work discovery when between WUs]

**Formatting guidance:**

- Mirrors the session-init orientation summary — bookend pattern
- **Session summary** is accomplishments, not a task list replay — focus on outcomes
- **Uncommitted work** maps to commits: enough detail for the next session to
  reconstruct proper atomic commits without re-reading diffs. Omit this section
  entirely when all work is committed — less noise when there's nothing to report
- **Next session** is standalone and prominent — same scanning target as init's
  "Next action"

[session-init]: session-init.md
[arc-methods]: ../../arc-methods.md
[arc-methods-session]: ../../arc-methods.md#session-state
[dev-rules-arc]: ../../../../reference/constitution/DEV-RULES.ARC.md
[team-coordination]: ../../../../reference/strategies/arc/strategy-team-coordination.md
