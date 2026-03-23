# Strategy: Team Coordination

## Purpose

Lightweight conventions for multi-developer projects using ARC. Covers task ownership, team
branching patterns, merge conflict expectations, and integration with external project trackers.

**Prerequisite:** Familiarity with [Work Organization Strategy][work-org] (branching model,
work categories, protection modes). This strategy layers team-specific patterns on top of that
foundation.

**Scope:** Team coordination conventions only. For per-developer workspace structure, see
`user/README.md`.

---

## Contents

1. [Workflow Adaptations](#workflow-adaptations) — what changes in team mode
2. [Task Ownership](#task-ownership) — `(@name)` convention
3. [Person-to-Person Task Handoff](#person-to-person-task-handoff) — transferring work between developers
4. [Team Branching Patterns](#team-branching-patterns) — common multi-developer workflows
5. [Merge Conflict Expectations](#merge-conflict-expectations) — shared file conventions
6. [External Tracker Integration](#external-tracker-integration) — Jira, Linear, GitHub Issues

---

## Workflow Adaptations

How standard ARC workflows adapt when team mode is active. Detailed conventions follow
in subsequent sections and referenced documents.

| Aspect              | Solo (default)           | Team mode                                        |
|---------------------|--------------------------|--------------------------------------------------|
| Session notes       | `user/{identity}/`       | `user/{identity}/` (same structure)              |
| Work status         | `active/WORK-STATUS.md`  | `active/WORK-STATUS.md` (shared, one per branch) |
| ATOMIC-INBOX.md (1) | `user/{identity}/`       | `user/{identity}/` (same structure)              |
| One task at a time  | Single pair              | Per developer-agent pair (concurrent pairs OK)   |
| Task ownership      | Implicit                 | `(@name)` markers in task lists                  |
| Branching           | One branch per work unit | Multiple patterns — see below                    |

(1) ATOMIC-INBOX.md requires `pm.mode: arc-in-git`. Atomic tasks as a concept (task list
sections for off-plan work) are Core and always available.

**Key distinction:** WORK-STATUS.md is shared in `active/` (one per branch, tracked in git).
Personal files (SESSION-NOTES.md, ATOMIC-INBOX.md) live in `user/{identity}/` and are
gitignored — no merge conflicts between developers. The `user/` directory structure is
identical for solo and team; team scaling requires only adding identity directories. See
`user/README.md` for the full directory structure.

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

`(@name)` identifies the **human developer**, not their AI agent. ARC frames work as
human-agent pairs — the developer drives decisions while the agent assists with execution.
In team mode, multiple human-agent pairs collaborate, and the ownership marker identifies
which pair owns a task.

### Reassignment

Reassignment is a text edit — change the marker. No ceremony required. If using an external
tracker for assignment (see [External Tracker Integration](#external-tracker-integration)),
update the external tool as the source of truth and optionally update the ARC marker.

---

## Person-to-Person Task Handoff

When one developer-agent pair transfers active work to another — vacation, rotation, workload
rebalancing, or specialization change. Distinct from normal session handoff (same person, different
session) in that the *reader changes*, not just the time boundary.

Person-to-person handoff composes the existing [session-handoff][session-handoff] and
[session-init][session-init] workflows with enhanced context for the different reader. No new
ceremony — the standard workflows apply with the adjustments below.

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
   # Fetch outgoing developer's user directory via git notes
   git fetch origin refs/notes/arc/user/{outgoing}:refs/notes/arc/user/{outgoing}

   # Read their context (inspect, don't overwrite your own user dir)
   git notes --ref=arc/user/{outgoing} show HEAD
   ```

   This supplements WORK-STATUS.md with qualitative context — decisions, gotchas, and approach
   notes that aren't captured in tracked artifacts.

2. **Apply the agent-switching filter.** If the outgoing developer used a different AI agent,
   extract factual content (file references, decisions, known risks) and disregard agent-specific
   references (tool syntax, capability assumptions). Session-init's existing
   [agent-switching guidance][session-init] applies here.

3. **Verify task ownership.** Check the task list for `(@name)` markers confirming which tasks
   are assigned to you. WORK-STATUS.md shows the branch-level current task; the markers show
   your personal scope.

4. **Confirm understanding.** Report your understanding in the session-init orientation summary.
   If the outgoing developer is available, confirm before starting work. If not, the documents
   should stand alone — see async conventions below.

### Async Conventions

Person-to-person handoff is designed to work asynchronously. The outgoing developer may not be
available when the incoming developer starts. Design for this:

- **Documents must stand alone.** SESSION-NOTES.md + WORK-STATUS.md should provide complete
  orientation without verbal walkthrough. When writing for handoff, ask: "Would this make sense
  to someone reading it cold?"
- **WORK-STATUS.md provides minimum viable context.** Even without SESSION-NOTES.md, the project
  pointer (branch, task list, current task, next action) is sufficient to start work. Session
  notes are an enhancement, not a prerequisite.
- **Graceful degradation applies.** If git notes weren't pushed or aren't available, fall back to
  WORK-STATUS.md + task list + git log. Less context is not no context — the incoming developer
  starts with tracked artifacts and builds understanding through the work itself.
- **Questions are expected.** The incoming developer may need to leave questions in commit
  messages, PR comments, or team channels. Not having the outgoing developer available is
  normal, not a blocker.

---

## Team Branching Patterns

These patterns build on the [branching model in the work organization strategy][work-org].
Choose the pattern that fits your team's review culture and the work at hand — patterns can
coexist within a project.

### Shared Integration Branch

The team works off a shared feature or technical branch. Each developer commits directly
to the shared branch (or uses short-lived personal branches that merge into it).

```text
main
└── feature/user-authentication        # Shared — all team members commit here
```

**Best for:** Small teams (2-3 developers), tightly coupled work where frequent integration
is more valuable than isolated review.

**Trade-off:** Less PR review surface between team members. Relies on communication and
local review.

### Personal Sub-Branches

Each developer gets a sub-branch off the shared integration branch. Work is reviewed
via PR into the shared branch before final integration.

```text
main
└── feature/user-authentication        # Integration branch
    ├── feature/user-auth/alice        # Alice's working branch
    └── feature/user-auth/bob          # Bob's working branch
```

**Best for:** Teams wanting PR review between members while sharing an integration point.
Works well with the fully protected branch mode.

**Trade-off:** More branch management overhead. Requires rebasing or merging from the
integration branch as peers' work lands.

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

**Best for:** Larger tasks where each developer's work naturally decomposes into
reviewable chunks. Enables parallel review.

### Direct Shared Branch

All team members commit to the same branch with no sub-branches. The simplest model —
essentially solo workflow with multiple contributors.

**Best for:** Very small, tightly scoped work. Quick collaborative fixes.

**Trade-off:** No review gate between team members. Merge conflicts resolved in real time.

---

## Merge Conflict Expectations

### Task Lists Are Shared Files

In team mode, task lists (`active/{category}/tasks-*.md`) are communal — multiple
developers reference and update them. This means:

- **Merge conflicts are expected** when team members mark different tasks complete on
  different branches. These conflicts are trivially resolvable — they involve checkbox
  state (`[ ]` → `[x]`) and completion notes on non-overlapping tasks.

- **Resolution is mechanical:** Accept both sides' checkbox changes. If both modified
  the same task (unlikely with ownership markers), coordinate verbally.

- **Minimize conflict surface:** Avoid reformatting or restructuring task lists on
  feature branches. Make structural changes (reordering, adding phases) on the
  integration branch or base branch where all members can pull them.

### Session State Merge Behavior

Personal files in `user/{identity}/` (SESSION-NOTES.md and, with `pm.mode: arc-in-git`,
ATOMIC-INBOX.md) are gitignored — no merge conflicts by design. Only one developer writes to
each identity directory.

`WORK-STATUS.md` in `active/` is shared (one per branch, tracked in git). Merge conflicts on
WORK-STATUS.md are trivial: `.gitattributes` with `merge=ours` auto-resolves local merges by
keeping the target branch version; PR merges take the base branch version. Post-merge workflows
update WORK-STATUS.md immediately, so the auto-resolved content is transient. See
[Work Organization Strategy][work-org] § Task Lists and Branches for the full merge convention.

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

### How They Complement Each Other

External trackers excel at cross-team visibility, sprint planning, and stakeholder
reporting. ARC task lists excel at implementation-level detail that agents need for
context — subtask breakdowns, acceptance criteria, completion notes, and session handoffs.

Neither replaces the other. A Jira ticket might say "Implement user authentication";
the ARC task list breaks that into 15 subtasks with specific acceptance criteria that
the human-agent pair works through one at a time.

### Integration Mechanism

ARC provides extension points at key workflow moments for syncing with external trackers.
Configure these in [`arc-extensions.md`][arc-extensions]:

- **`post-task-completion`** — fires after a task is marked `[x]`. Use to sync task status
  to Jira, Linear, or GitHub Issues.
- **`post-work-unit-activate`** — fires after a work unit moves from backlog to active. Use
  to update sprint boards or project status.
- **`post-work-unit-archive`** — fires after a work unit is archived. Use to close epics or
  update project dashboards.

No extension points are needed for task *assignment* — `(@name)` markers and external tracker
assignment serve different audiences and don't need real-time sync.

### When `(@name)` Markers Are Optional

If the external tracker owns assignment, `(@name)` markers in ARC task lists are
convenience annotations — helpful for quick scanning but not the source of truth. Keep
them if they're useful, skip them if they'd drift from the tracker.

---

## Related Documentation

- [Work Organization Strategy][work-org] — Branching model, work categories, protection modes
- [Development Methodology][dev-methodology] — Task management protocol, commit standards
- [Process Task Loop][process-task-loop] — Task execution workflow
- `user/README.md` — Per-developer workspace structure and session state

---

[work-org]: strategy-work-organization.md
[dev-methodology]: ../../constitution/DEV-RULES.ARC.md
[process-task-loop]: ../../../system/workflows/arc/3_process-task-loop.md
[session-handoff]: ../../../system/workflows/arc/session-lifecycle/session-handoff.md
[session-init]: ../../../system/workflows/arc/session-lifecycle/session-init.md
[arc-extensions]: ../../../system/workflows/arc-extensions.md
