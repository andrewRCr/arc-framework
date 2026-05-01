# Strategy: Team Coordination

> **Guide and rationale:** [Team Coordination](https://andrewrcr.github.io/arc-framework/reference/team-coordination/)
> on the docs site covers branching pattern trade-offs, merge conflict expectations, and
> tracker complementarity reasoning.

Operational specification for multi-developer ARC projects. Covers task ownership conventions,
team branching patterns, merge conflict handling, and external tracker integration.

These conventions activate when `team.mode: true` is set in `arc-config.yml`. Some structural
foundations are always present regardless of team mode — per-identity `user/{identity}/`
directories, per-WU `status-{name}.md` files in `active/{category}/`. The conventions below
add coordination patterns on top of that foundation.

**Prerequisite:** [Work Organization Strategy][work-org] (branching model, work categories,
protection modes). This strategy layers team-specific patterns on top of that foundation.

**Scope:** Team coordination conventions only. For per-developer workspace structure, see
`user/README.md`.

---

## Contents

1. [Workflow Adaptations](#workflow-adaptations) — what changes in team mode
2. [Task Ownership](#task-ownership) — `(@name)` convention
3. [Person-to-Person Task Handoff](#person-to-person-task-handoff) — transferring work between developers
4. [Team Branching Patterns](#team-branching-patterns) — common multi-developer workflows
5. [Merge Conflict Expectations](#merge-conflict-expectations) — shared file conventions, concurrent sessions
6. [External Tracker Integration](#external-tracker-integration) — Jira, Linear, GitHub Issues

---

## Workflow Adaptations

How standard ARC workflows adapt when team mode is active. Detailed conventions follow
in subsequent sections and referenced documents.

| Aspect              | Solo (default)                       | Team mode                                         |
|---------------------|--------------------------------------|---------------------------------------------------|
| Session notes       | `user/{identity}/`                   | `user/{identity}/` (same structure)               |
| Work status         | `active/{category}/status-{name}.md` | `active/{category}/status-{name}.md` (one per WU) |
| ATOMIC-INBOX.md (1) | `user/{identity}/`                   | `user/{identity}/` (same structure)               |
| One task at a time  | Single pair                          | Per developer-agent pair (concurrent pairs OK)    |
| Task ownership      | Implicit                             | `(@name)` markers in task lists                   |
| Branching           | One branch per work unit             | Multiple patterns — see below                     |

(1) ATOMIC-INBOX.md requires `pm.mode: arc-in-git`. Atomic tasks as a concept (task list
sections for off-plan work) are Core and always available.

**Key distinction:** Each active work unit has its own `status-{name}.md` in
`active/{category}/`, tracked in git and shared across developers working on that WU. It
represents **WU-level state** — "Next Task" is the WU's next incomplete task, not any
individual developer's personal next task. In team mode, each developer resolves their
personal next task by scanning `(@name)` markers in the task list (see
[session-init][session-init] team-mode step). Personal files (SESSION-NOTES.md, ATOMIC-INBOX.md)
live in `user/{identity}/` and are gitignored — no merge conflicts between developers. The
`user/` directory structure is identical for solo and team; team scaling requires only adding
identity directories. See `user/README.md` for the full directory structure.

---

## Task Ownership

### The `(@name)` Convention

Mark task ownership in task list checkboxes using `(@name)`:

```markdown
- [ ] Implement authentication flow (@alice)
- [ ] Set up CI pipeline (@bob)
- [ ] Write API documentation (@alice)
```

Phase headers can also carry ownership for area-level assignment:

```markdown
### Phase 3: Auth Layer (@alice)
```

### Scope

`(@name)` is used in **task lists only** — checkboxes and optionally phase headers. It is not
used in commit messages, branch names, or other locations. Git already tracks authorship through
commits; duplicating that information in ARC metadata adds maintenance burden without value.

### Identity

`(@name)` identifies the **human developer**, not their AI agent. In team mode, multiple
human-agent pairs collaborate — the ownership marker identifies which pair owns a task.

### Reassignment

Reassignment is a text edit — change the marker. No ceremony required. If using an external
tracker for assignment (see [External Tracker Integration](#external-tracker-integration)),
update the external tool as the source of truth and optionally update the ARC marker.

---

## Person-to-Person Task Handoff

A structured approach for transferring active work between developer-agent pairs — vacation,
rotation, workload rebalancing, or specialization change. Distinct from normal session handoff
(same person, different session) in that the *reader changes*, not just the time boundary.

This protocol composes the existing [session-handoff][session-handoff] and
[session-init][session-init] workflows with enhanced context for the different reader. No new
ceremony — the standard workflows apply with the adjustments below. Teams can follow this
fully, partially, or rely on informal coordination — the minimum viable handoff is updating
`(@name)` markers and pushing session notes.

### Outgoing Responsibilities

The outgoing developer runs a standard session handoff with these additions:

1. **Reassign task ownership.** Update `(@name)` markers in the task list for the incoming
   developer — at minimum the current task and immediate next tasks. This is visible to anyone
   reading the task list and doesn't require fetching session notes.

2. **Write SESSION-NOTES.md for a different reader.** Normal session notes assume "future me" as
   the audience. For person-to-person handoff, write for someone with no prior context:
   - **Decisions and rationale** — not just "what" but "why this approach"
   - **Code landmarks** — key files, tricky sections, line numbers worth reading first
   - **Known gotchas** — edge cases, data format quirks, things that look wrong but aren't
   - **Approaches tried and abandoned** — prevents the incoming developer from re-exploring
     dead ends
   - **Priority guidance** — if multiple tasks remain, what ordering matters and why

3. **Push user directory.** Ensure git notes are pushed so the incoming developer can fetch
   them (see session-handoff workflow for the git notes save-and-push steps). With
   `user.sync_push: prompt` (the team default), confirm the push when prompted.

### Incoming Bootstrap

The incoming developer runs a standard session-init with these additions:

1. **Fetch the outgoing developer's context.** If the outgoing developer pushed git notes,
   fetch their namespace and load their context:

   ```bash
   # Fetch the outgoing developer's notes ref, then load that identity's user directory
   arc user fetch --identity {outgoing}
   arc user load --identity {outgoing}
   ```

   The CLI extracts the outgoing developer's SESSION-NOTES and workspace files into a
   readable format. This supplements the active WU's `status-{name}.md` with qualitative
   context — decisions, gotchas, and approach notes that aren't captured in tracked artifacts.

2. **Verify task ownership.** Check the task list for `(@name)` markers confirming which tasks
   are assigned to you. The WU's `status-{name}.md` shows the current task; the markers show
   your personal scope.

3. **Confirm understanding.** Report your understanding in the session-init orientation summary.
   If the outgoing developer is available, confirm before starting work. If not, the documents
   should stand alone — see async conventions below.

### Async Conventions

Person-to-person handoff works asynchronously — the outgoing developer may not be available
when the incoming developer starts.

- **Documents must stand alone.** SESSION-NOTES.md + the active WU's `status-{name}.md`
  should provide complete orientation without verbal walkthrough.
- **`status-{name}.md` provides minimum viable context.** Even without SESSION-NOTES.md, the
  project pointer (branch, task list, current task, next action) is sufficient to start work.
- **Graceful degradation.** If git notes weren't pushed, fall back to `status-{name}.md` +
  task list + git log.
- **Questions are expected.** The incoming developer may leave questions in commit messages,
  PR comments, or team channels.

---

## Team Branching Patterns

These patterns build on the [branching model in the work organization strategy][work-org].
Choose the pattern that fits your team's review culture and the work at hand — patterns can
coexist within a project.

**`Branch(es):` header field:** Task lists record branches as a flat comma-separated list
(e.g., `feature/user-auth, feature/user-auth/alice, feature/user-auth/bob`). This is
intentionally flat — the list captures which branches exist, not their topology. Branch
relationships (which is the integration branch, which are sub-branches) are documented in
the branching pattern choice, not encoded in the field format.

### Shared Integration Branch

The team works off a shared feature or technical branch. Each developer commits directly
to the shared branch (or uses short-lived personal branches that merge into it).

```text
main
└── feature/user-authentication        # Shared — all team members commit here
```

### Personal Sub-Branches

Each developer gets a sub-branch off the shared integration branch. Work is reviewed
via PR into the shared branch before final integration.

```text
main
└── feature/user-authentication        # Integration branch
    ├── feature/user-auth/alice        # Alice's working branch
    └── feature/user-auth/bob          # Bob's working branch
```

### Stacked PRs per Developer

Each developer creates a sequence of stacked branches for their portion of the work,
reviewed independently. This extends the [stacked branch model][work-org] from solo
to team use.

```text
main
└── feature/user-authentication              # Integration branch
    ├── feature/user-auth/alice-models       # Alice's first PR
    │   └── feature/user-auth/alice-api      # Alice's second PR (stacked)
    └── feature/user-auth/bob-frontend       # Bob's work
```

### Direct Shared Branch

All team members commit to the same branch with no sub-branches. The simplest model —
essentially solo workflow with multiple contributors.

---

## Merge Conflict Expectations

### Task Lists Are Shared Files

In team mode, task lists (`active/{category}/tasks-*.md`) are communal — multiple
developers reference and update them. This means:

- **Merge conflicts are expected** when team members mark different tasks complete on
  different branches. These conflicts are straightforward to resolve manually — they
  typically involve checkbox state (`[ ]` → `[x]`) and completion notes on non-overlapping
  tasks. Git may produce larger conflict markers when changes are near each other or when
  multi-line completion notes overlap with surrounding context.

- **Resolution example:** When Alice marks Task 3.1 `[x]` and Bob marks Task 3.2 `[x]`
  on different branches, accept both checkbox changes. If both modified the same task
  (unlikely with `(@name)` markers), coordinate verbally.

- **Minimize conflict surface:** Keep task list edits minimal — checkbox state plus
  completion notes only. Avoid reformatting or restructuring task lists on feature
  branches. Make structural changes (reordering, adding phases) on the integration branch
  or base branch where all members can pull them.

### Session State Merge Behavior

Personal files in `user/{identity}/` (SESSION-NOTES.md and, with `pm.mode: arc-in-git`,
ATOMIC-INBOX.md) are gitignored — no merge conflicts by design. Only one developer writes to
each identity directory.

Per-WU status files (`active/{category}/status-{name}.md`) are tracked and shared across
developers working on the same WU. Parallel work units on independent branches never collide
at the status-file layer — each WU carries its own file, and merges to the base branch never
touch the same path from both sides. Within-WU coordination (team sub-branches sharing one
status file) resolves through normal git merge behavior: non-overlapping field edits merge
cleanly, field-level collisions surface as merge conflicts that the integration branch owner
resolves manually. `(@name)` marker discipline on task lists minimizes status-file field
overlap in practice, and the status-file timing rule (see [DEV-RULES.ARC][dev-methodology]
§ Commit Discipline) narrows the write surface further — the file is touched only at
handoff and workflow-ceremony commits, so concurrent same-field writes are rare.

See [Work Organization Strategy][work-org] § Task Lists and Branches for the full merge
convention.

### Concurrent Sessions

Sequential handoff (Alice finishes, Bob starts) is the common pattern. When multiple
developers work simultaneously, two different topologies carry different coordination
properties — address them separately.

**Parallel work units on independent branches.** Alice works on
`feature/auth/feature-auth-refresh` with its own `status-auth-refresh.md`; Bob works on
`technical/ci-matrix` with its own `status-ci-matrix.md`. The work units don't coordinate at
all at the status-file layer: different files, different branches, different task lists.
Independent WUs merge to the base branch without ever touching each other's status files.
This is the dominant pattern for parallel solo work on independent concerns.

**Within-WU team sub-branches.** Alice and Bob both work on the same WU via personal
sub-branches (`feature/user-auth/alice`, `feature/user-auth/bob`) off a shared integration
branch. They share one `status-{name}.md`. Coordination mechanisms:

- **Task list:** Each developer works their `(@name)`-assigned tasks. Conflicts only arise
  when both commit task list updates at the same time — pull before committing to reduce
  conflict frequency. Remaining conflicts are resolved as described under
  [Task Lists Are Shared Files](#task-lists-are-shared-files).
- **Status file (`status-{name}.md`):** Shared write surface. Non-overlapping field edits
  merge cleanly; concurrent edits to the same field (e.g., both advancing `Next Task`)
  produce a merge conflict that the integration branch owner resolves manually. Last
  committer's update wins as the default convention when edits are compatible — each
  developer resolves their personal next task from `(@name)` markers at session-init and
  doesn't depend on the shared status file for personal state.
- **SESSION-NOTES.md:** No conflict possible — each developer writes to their own
  `user/{identity}/` directory.

### Configuration Notes

**`user.sync_push` and team mode:** When `arc init` sets `team.mode: true`, it defaults
`user.sync_push` to `prompt` (ask before pushing session notes). If you toggle `team.mode`
after init by editing `arc-config.yml`, `user.sync_push` is not automatically updated — check
and adjust it manually. Per-developer override: `git config arc.syncPush <always|prompt|manual>`.

---

## External Tracker Integration

### ARC as Execution Layer

Teams using external project trackers (Jira, Linear, GitHub Issues) treat them as the
**assignment and status layer** while ARC task lists serve as the **execution layer**:

| Concern               | External Tracker             | ARC Task List                        |
|-----------------------|------------------------------|--------------------------------------|
| Task assignment       | Primary (who owns what)      | Optional `(@name)` for convenience   |
| Status tracking       | Primary (board view, sprint) | Checkbox state for agent context     |
| Implementation detail | Not tracked                  | Subtasks, acceptance criteria, notes |
| Session context       | Not tracked                  | SESSION-NOTES.md, handoff state      |

### Integration Mechanism

ARC provides extension points at key workflow moments for syncing with external trackers.
Configure these by populating the `.actions` section in the relevant file under
[`system/extensions/`][arc-extensions-dir]:

- **[`post-task-completion`][arc-ext-task-completion]** — fires after a task is marked `[x]`.
  Use to sync task status to Jira, Linear, or GitHub Issues.
- **[`post-work-unit-activate`][arc-ext-wu-activate]** — fires after a work unit moves from
  backlog to active. Use to update sprint boards or project status.
- **[`post-work-unit-archive`][arc-ext-wu-archive]** — fires after a work unit is archived.
  Use to close epics or update project dashboards.

No extension points are needed for task *assignment* — `(@name)` markers and external tracker
assignment serve different audiences and don't need real-time sync.

### When `(@name)` Markers Are Optional

If the external tracker owns assignment, `(@name)` markers in ARC task lists are
convenience annotations — helpful for quick scanning but not the source of truth. Keep
them if they're useful, skip them if they'd drift from the tracker.

---

## Related Documentation

- [Work Organization Strategy][work-org] — Branching model, work categories, protection modes
- [DEV-RULES.ARC][dev-methodology] — Task management protocol, commit standards
- [Process Task Loop][process-task-loop] — Task execution workflow
- `user/README.md` — Per-developer workspace structure and session state

---

[work-org]: strategy-work-organization.md
[dev-methodology]: ../../constitution/DEV-RULES.ARC.md
[process-task-loop]: ../../../system/workflows/arc/3_process-task-loop.md
[session-handoff]: ../../../system/workflows/arc/session-lifecycle/session-handoff.md
[session-init]: ../../../system/workflows/arc/session-lifecycle/session-init.md
[arc-extensions-dir]: ../../../system/extensions/
[arc-ext-task-completion]: ../../../system/extensions/post-task-completion.md
[arc-ext-wu-activate]: ../../../system/extensions/post-work-unit-activate.md
[arc-ext-wu-archive]: ../../../system/extensions/post-work-unit-archive.md
