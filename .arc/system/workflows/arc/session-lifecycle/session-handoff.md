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
5. **Working directory** — if it changed during the session, update paths in WORK-STATUS.md

> **Contributor role (`arc.role = contributor`):** Contributors write SESSION-NOTES.md and save
> to git notes (same as maintainers), but skip project-level WORK-STATUS.md updates (items 4–5
> above), the WORK-STATUS.md section below, and the Conditional WORK-STATUS.md Commit section.
> Contributors don't manage the project work pipeline — proceed directly to the SESSION-NOTES.md
> update, git notes save, and confirmation.

### What to Update

Session state is split across two files (per the [session-state method][arc-methods-session] default — if your
project overrides session-state, follow the override instead):

- **WORK-STATUS.md** (tracked, `.arc/active/`) — project state: branch, task list, next task, blockers, next action
- **SESSION-NOTES.md** (gitignored, `.arc/user/{identity}/`) — personal context: completed work, decisions,
  debugging insights, things tried. Replaced each handoff (not appended). Created only when there's context
  worth preserving. Between work units, reset to persistent context only (if any exists) or a minimal
  completion marker. Identity resolved from `git config arc.identity`.

> **Person-to-person handoff:** If handing off to a different developer (not just ending your
> own session), write SESSION-NOTES.md for someone with no prior context on this work and
> reassign task ownership via `(@name)` markers. See [Team Coordination
> Strategy][team-coordination] § Person-to-Person Task Handoff for the full protocol.

**Every handoff** — WORK-STATUS.md (state fields) and SESSION-NOTES.md (session context, if any)

**When context changes** — Working directory paths or environment expectations in WORK-STATUS.md

**Preserve persistent context** — The `## Persistent Context` section in SESSION-NOTES.md carries
cross-session constraints (naming conventions, architectural decisions, deferred items) that survive
across handoffs. Each entry has an explicit removal trigger. During handoff,
rewrite ephemeral sections (Completed Work, Remaining Work, Additional Context) but preserve
persistent context entries whose triggers haven't been met. Remove entries whose triggers are met.

### Comprehensive Handoff Format

Update session state files before ending session:

1. **First**: Review `## Persistent Context` — preserve entries whose triggers aren't met, remove entries
   whose triggers are met
2. **Second**: Check if working directory context changed and update paths in WORK-STATUS.md if needed
3. **Then**: Update both files with work progress:

**Update `.arc/active/WORK-STATUS.md`** (tracked project state):

```markdown
## Active Work

**Branch**: [current branch name, e.g., feature/config-parser]
**Task List**: [path to task list, e.g., .arc/active/feature/tasks-config-parser.md]
  [OR: [none associated] for planning/boundary work between task lists]
**Following Task List**: Yes
  [OR: No - [brief context, e.g., "fixing connection timeout in batch processor (will return to Task 4.5)"]]
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

```markdown
### Completed Work

**CRITICAL: When documenting UNCOMMITTED work, use commit-level granularity.**

Next session needs enough detail to recreate proper atomic commits from `git diff`:
- Map accomplishments to logical commits (what changed, which files/components)
- Include task numbers/references for `Context:` footer
- Note any incidental work separate from task list work
- Provide specificity: component names, file paths, what was changed

**Good examples (uncommitted work):**

- ✅ Task 3.2.1: Added input validation to config parser (src/config.py, src/validators.py) - rejects malformed YAML
- ✅ Task 3.2.2: Updated API response schema (api/v2/schemas.py:45-67) - added nullable fields for partial updates
- ✅ Incidental: Fixed broken cross-reference in workflow doc (session-init.md) - corrected template path

**Bad examples (too vague for commit reconstruction):**

- ❌ "Worked on the parser" (no file mapping, no commit grouping)
- ❌ "Updated several files" (which? for what commits?)
- ❌ "Fixed bugs" (what bugs? which files? separate commits?)

**For committed work:** Simple list with commit hashes is sufficient (commit messages already documented details).

### Remaining Work Before Returning to Task List

_(Only for off-task-list work, only if path is known. Otherwise state "Path unclear - will return to Task X.Y when resolved.")_

1. [Step 1]
2. [Step 2]
3. Return to Task X.Y — Title (line ~XXX in tasks-file.md)

### Additional Context

[Supplemental information not in task list: debugging insights, decisions made, things tried/ruled out, constraints discovered]

[OR: [none] if task list has all needed context]

### Persistent Context

<!-- Entries that survive across handoffs. Each has an explicit removal trigger. -->
<!-- Review at each handoff: remove entries whose triggers have been met. -->

**[Entry name]:**
*Remove when: [explicit trigger condition]*

- [Context that must persist until trigger is met]

---

**Commit at Handoff**: `{{short-hash}}`

**Last Updated**: {{YYYY-MM-DD}}
```

**What to include:**

- **Remaining Work** - Only for off-task-list work when path back is known
    - List ALL steps if known, not just immediate next
    - Critical: Captures full path back to task list (use triple-anchor format: task number + title + line hint)
- **Additional Context** - Supplemental info not in task list
    - Debugging: What tried, what ruled out, what suspected
    - Decisions: Choices made that inform approach
    - Constraints: User preferences, technical limitations
    - Goal: Don't repeat work, don't lose insights
- **Persistent Context** - Context that must survive across multiple handoffs
    - Each entry needs an explicit removal trigger (not tied to full work unit completion)
    - Examples: design decisions to apply consistently, parked work items, naming conventions
    - Review at each handoff: remove entries whose triggers are met

**What NOT to include:**

- ❌ Summaries of entire task list (that's in the task list file)
- ❌ Future work beyond path back to task list
- ❌ Project status updates (that's in git commits)
- ❌ Task descriptions already in task list (redundant)

### Handoff Examples

**Example 1: Off-task-list with known path back**

WORK-STATUS.md:

```markdown
## Active Work

**Branch**: feature/data-pipeline
**Task List**: .arc/active/feature/tasks-data-pipeline.md
**Following Task List**: No - fixing connection timeout in batch processor (will return to Task 4.1)
**Next Task**: Task 4.1 — Add retry logic to ingestion step (line ~312)
**Last Completed**: Task 3.5 — Schema validation for input records
**Blockers**: [none]
**Next Action**: Fix connection timeout in batch processor (src/pipeline/batch.py:89)
```

SESSION-NOTES.md:

```markdown
### Completed Work

- ✅ Task 3.5: Added schema validation for input records
- ⚠️ Discovered connection timeout during integration testing

### Remaining Work Before Returning to Task List

1. Fix connection timeout in batch processor (pool exhaustion under load)
2. Add integration test for concurrent batch processing
3. Run full test suite to verify no regressions
4. Return to Task 4.1 — Add retry logic (line ~312 in tasks-data-pipeline.md)

> **Unclear path variant:** When the fix isn't known yet, replace the numbered steps with:
> `Path unclear - exploratory debugging. Will return to Task 4.1 — Add retry logic (line ~312)
> when resolved.`

### Additional Context

- Timeout occurs when batch size exceeds 1000 records (connection pool default is 10)
- Tried increasing pool size to 50, but underlying issue is sequential processing blocking connections
- Best fix: switch to async batch processing with connection pool recycling
```

**Example 2: Preparatory work before starting task**

WORK-STATUS.md:

```markdown
## Active Work

**Branch**: technical/api-documentation
**Task List**: .arc/active/technical/tasks-api-documentation.md
**Following Task List**: Yes
**Next Task**: Task 3.1 — Document authentication endpoints (line ~203)
**Last Completed**: Tasks 2.3-2.4 — Query parameter and response format sections
**Blockers**: [none]
**Next Action**: Review auth middleware source before documenting Task 3.1 endpoints
```

SESSION-NOTES.md:

```markdown
### Completed Work

- ✅ Task 2.3: Query parameter documentation (committed a1b2c3d)
- ✅ Task 2.4: Response format documentation (committed a1b2c3d)

### Additional Context

**Pre-task review needed:**

1. Auth middleware has undocumented rate limiting behavior — need to read source before documenting
2. Token refresh flow has edge case when refresh token expires mid-request
```

### Task List Completion & Transition Format

**When work is complete and/or task list has been archived**, use this expanded format:

WORK-STATUS.md:

```markdown
## Active Work

**Last Completed**: [Task list name] (Tasks X-Y, archived)
**Blockers**: [none]
**Next Action**: Begin [new-task-list.md] starting with Task 1
```

SESSION-NOTES.md at completion is minimal — accomplishment summary with commit hashes, archive
path. Preserve any Persistent Context entries that span work units; reset ephemeral sections.

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

### Conditional WORK-STATUS.md Commit (Maintainer Only)

**Skip when `arc.role = contributor`** — contributors don't update project-level WORK-STATUS.md.

If WORK-STATUS.md is dirty after the handoff update and no task commit is pending to carry it,
commit it as part of the handoff. This resolves the "dangling WORK-STATUS.md" gap during
off-task-list sessions (evaluation, design discussions, pre-planning) where no task commit
naturally includes it. The handoff invocation is the approval — do not ask separately.

**Trigger**: WORK-STATUS.md is dirty (`git diff --name-only` shows it) and no other
staged/unstaged changes are pending that would form a task commit.

**Action**: Commit standalone as part of the handoff:

```bash
git add .arc/active/WORK-STATUS.md
git commit -m "docs(arc): update WORK-STATUS.md

Context: maintenance (atomic / no associated task list)"
```

**Skip when**: WORK-STATUS.md will ride with a pending task commit (the normal case — see
DEV-RULES.ARC § Work status accuracy).

### Confirm Handoff

After updating WORK-STATUS.md and SESSION-NOTES.md, deliver a verbal summary to the user. This is a quick
confirmation for the human — the session state files are the durable artifacts.

**ARC session handoff complete** · `{branch-name}` · {clean | uncommitted changes}

**Session summary:**

- [What was accomplished — bullet per logical unit of work]
- [Include commit hashes for committed work]

**Uncommitted work:**

- [Files/changes with logical commit grouping]

**Next session:** [What comes next per WORK-STATUS.md]

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
[team-coordination]: ../../../../reference/strategies/arc/strategy-team-coordination.md
