# Team Coordination

ARC's core methodology (sessions, task execution, quality gates, commit discipline) is
designed around a single developer-agent pair. Team coordination adds conventions for multiple
pairs working on the same project, activated by setting `team.mode: true` in `arc-config.yml`.

This page covers the key patterns and rationale at guide level. For the complete operational
protocol (merge conflict resolution steps, concurrent session handling, configuration notes,
and the full person-to-person handoff procedure), see `strategy-team-coordination.md` in your
`.arc/reference/strategies/` directory.

## What Changes in Team Mode

Most of ARC stays the same. The core adaptation is that "one task at a time" applies
*per developer-agent pair* — multiple pairs can work on different tasks simultaneously.
Everything else layers on top of the existing model:

| Aspect         | Solo (default)                | Team mode                                          |
|----------------|-------------------------------|----------------------------------------------------|
| Task execution | Single pair, sequential tasks | Per pair, concurrent pairs OK                      |
| Task ownership | Implicit (only one developer) | `(@name)` markers in task lists                    |
| Session state  | `user/{identity}/` directory  | Same structure, one directory per developer        |
| Work status    | One WORK-STATUS.md per branch | Same; represents branch-level state, not personal  |
| Branching      | One branch per work unit      | Multiple patterns available                        |

The `user/{identity}/` directory structure is identical in solo and team mode. Team scaling
means adding identity directories — one per developer. Personal files like SESSION-NOTES.md
are gitignored, so concurrent developers never conflict on session state.

## Task Ownership

Mark task ownership in task list checkboxes using `(@name)`:

```markdown
- [ ] **3.1 Implement authentication flow** (@alice)
- [ ] **3.2 Set up CI pipeline** (@bob)
- [ ] **3.3 Write API documentation** (@alice)
```

`(@name)` identifies the human developer, not their AI agent — ARC frames work as human-agent
pairs, and the marker identifies which pair owns a task. Reassignment is a text edit: change
the marker.

WORK-STATUS.md shows the branch's next incomplete task. In team mode, each developer resolves
their personal next task by scanning `(@name)` markers in the task list during session
initialization.

## Branching Patterns

Team branching builds on ARC's standard branching model. Choose the pattern that fits your
team's review culture — patterns can coexist within a project.

### Shared integration branch

Everyone commits to the same feature branch. Simplest model.

```text
main
└── feature/user-authentication    ← all team members commit here
```

Best for small teams (2–3 developers) with tightly coupled work where frequent integration
matters more than isolated review.

### Personal sub-branches

Each developer gets a sub-branch off the shared integration branch. Work is reviewed via PR
into the shared branch before final integration.

```text
main
└── feature/user-authentication         ← integration branch
    ├── feature/user-auth/alice         ← Alice's working branch
    └── feature/user-auth/bob           ← Bob's working branch
```

Best for teams wanting PR review between members while sharing an integration point.

### Stacked PRs per developer

Each developer creates a sequence of stacked branches for their portion of the work, reviewed
independently.

```text
main
└── feature/user-authentication              ← integration branch
    ├── feature/user-auth/alice-models       ← Alice's first PR
    │   └── feature/user-auth/alice-api      ← Alice's second PR (stacked)
    └── feature/user-auth/bob-frontend       ← Bob's work
```

Best for larger tasks where each developer's work naturally decomposes into reviewable chunks.

### Choosing a pattern

Start with the shared integration branch — it's the simplest and works for most team sizes.
Move to personal sub-branches when you want PR review between team members, or stacked PRs
when individual developers' work naturally decomposes into reviewable chunks. Patterns can
coexist within a project: use a shared branch for tightly coupled tasks and sub-branches
for independent streams.

The key trade-off is **integration frequency vs review surface**. Shared branches integrate
constantly but have no review gate between team members. Sub-branches and stacked PRs add
review gates but require more branch management and periodic rebasing.

## Merge Conflicts

Task lists are shared files — multiple developers reference and update them. Merge conflicts
are expected and typically straightforward to resolve.

The most common conflict: two developers mark different tasks complete on different branches.
Resolution is mechanical — accept both checkbox changes. If both modified the same task
(unlikely with `(@name)` markers), coordinate verbally.

**Minimizing conflict surface:** Keep task list edits minimal — checkbox state plus completion
notes only. Avoid reformatting or restructuring task lists on feature branches. Make structural
changes (reordering, adding phases) on the integration branch where all members can pull them.

**Personal files don't conflict.** Files in `user/{identity}/` (like SESSION-NOTES.md) are
gitignored — each developer writes to their own directory. Only WORK-STATUS.md (shared,
tracked, one per branch) can produce merge conflicts between developers, and `.gitattributes`
auto-resolves most cases.

## Person-to-Person Handoff

When work transfers between developers (vacation, rotation, workload rebalancing), ARC's
standard session handoff extends with conventions for a different reader:

- The **outgoing developer** reassigns `(@name)` markers in the task list, writes
  SESSION-NOTES.md for someone with no prior context (decisions, code landmarks, gotchas,
  dead ends), and pushes user state via git notes.
- The **incoming developer** fetches the outgoing developer's context via
  `arc user pull --identity {outgoing}` and verifies task ownership markers.

The protocol is designed for async handoff — the outgoing developer may not be available when
the incoming developer starts. WORK-STATUS.md + task list + git log provide minimum viable
context; SESSION-NOTES.md enhances it.

## External Tracker Integration

Teams using Jira, Linear, GitHub Issues, or similar tools use them as the **assignment and
status layer** while ARC task lists serve as the **execution layer**:

| Concern               | External tracker        | ARC task list                        |
|-----------------------|-------------------------|--------------------------------------|
| Task assignment       | Primary                 | Optional `(@name)` for convenience   |
| Status tracking       | Primary (board, sprint) | Checkbox state for agent context     |
| Implementation detail | Not tracked             | Subtasks, acceptance criteria, notes |
| Session context       | Not tracked             | SESSION-NOTES.md, handoff state      |

Neither replaces the other. A Jira ticket might say "Implement user authentication"; the ARC
task list breaks that into 15 subtasks with acceptance criteria that the developer-agent pair
works through one at a time.

ARC provides extension points for syncing: `post-task-completion` (sync task status),
`post-work-unit-activate` (update sprint boards), and `post-work-unit-archive` (close epics).
Configure these in `arc-extensions.md`.

??? info "Why not just use the external tracker?"

    External trackers excel at cross-team visibility, sprint planning, and stakeholder reporting.
    ARC task lists excel at the implementation detail that agents need for context — subtask
    breakdowns, acceptance criteria, completion notes, and session handoffs. The two layers serve
    different audiences at different granularities.
