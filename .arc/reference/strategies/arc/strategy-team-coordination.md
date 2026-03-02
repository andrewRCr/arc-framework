# Strategy: Team Coordination

## Purpose

Lightweight conventions for multi-developer projects using ARC. Covers task ownership, team
branching patterns, merge conflict expectations, and integration with external project trackers.

**Prerequisite:** Familiarity with [Work Organization Strategy][work-org] (branching model,
work categories, protection modes). This strategy layers team-specific patterns on top of that
foundation.

**Scope:** Team coordination conventions only. For per-member session state and directory
structure, see `team/README.md`.

---

## Contents

1. [Task Ownership](#task-ownership) — `(@name)` convention
2. [Team Branching Patterns](#team-branching-patterns) — common multi-developer workflows
3. [Merge Conflict Expectations](#merge-conflict-expectations) — shared file conventions
4. [External Tracker Integration](#external-tracker-integration) — Jira, Linear, GitHub Issues

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

### Session State Has No Conflicts

`team/{name}/SESSION.md` and `team/{name}/ATOMIC-TASKS.md` are personal files —
only one developer writes to each. This is the primary reason for the `team/` directory
structure: eliminating file-level conflicts on session state. `WORK-STATUS.md` in `active/`
is shared (one per branch, tracked in git).

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
| Session context       | Not tracked                  | SESSION.md, handoff state            |

### How They Complement Each Other

External trackers excel at cross-team visibility, sprint planning, and stakeholder
reporting. ARC task lists excel at implementation-level detail that agents need for
context — subtask breakdowns, acceptance criteria, completion notes, and session handoffs.

Neither replaces the other. A Jira ticket might say "Implement user authentication";
the ARC task list breaks that into 15 subtasks with specific acceptance criteria that
the human-agent pair works through one at a time.

### When `(@name)` Markers Are Optional

If the external tracker owns assignment, `(@name)` markers in ARC task lists are
convenience annotations — helpful for quick scanning but not the source of truth. Keep
them if they're useful, skip them if they'd drift from the tracker.

---

## Related Documentation

- [Work Organization Strategy][work-org] — Branching model, work categories, protection modes
- [Development Methodology][dev-methodology] — Task management protocol, commit standards
- [Process Task Loop][process-task-loop] — Task execution workflow
- `team/README.md` — Per-member directory structure and session state

---

[work-org]: strategy-work-organization.md
[dev-methodology]: ../../constitution/DEV-RULES.ARC.md
[process-task-loop]: ../../../system/workflows/arc/3_process-task-loop.md
