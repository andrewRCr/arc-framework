# Strategy: Team Coordination

> **Guide and rationale:** [Team Coordination](https://andrewrcr.github.io/arc-framework/reference/team-coordination/)
> on the docs site covers branching pattern trade-offs, merge conflict expectations, and
> tracker complementarity reasoning.

Operational specification for multi-developer ARC projects. Covers task ownership conventions,
team branching patterns, merge conflict handling, and external tracker integration.

These conventions activate when `team.mode: true` is set in `arc-config.yml`. Some structural
foundations are always present regardless of team mode — per-identity `user/{identity}/`
directories, per-WU `meta-{name}.md` files in `active/{category}/`. The conventions below
add coordination patterns on top of that foundation.

**Prerequisite:** [Work Organization Strategy][work-org] (branching model, work categories,
protection modes). This strategy layers team-specific patterns on top of that foundation.

**Scope:** Team coordination conventions only. For per-developer workspace structure, see
`user/README.md`.

**Note on validation scope:** Team-mode conventions are designed against the dev+agent-pair
governance model intended to scale across team sizes. Active validation to date has been solo-dev;
team patterns will be refined as projects exercise them at scale. Treat the patterns below as a
deliberate starting point, not a settled standard. Field feedback on what works and what doesn't
shapes the framework's evolution.

---

## Contents

1. [Workflow Adaptations](#workflow-adaptations) — what changes in team mode
2. [Task Ownership](#task-ownership) — `(@name)` convention
3. [Person-to-Person Task Handoff](#person-to-person-task-handoff) — transferring work between developers
4. [Interlock-Release Coordination](#interlock-release-coordination) — commit/push settings in team mode
5. [Team Branching Patterns](#team-branching-patterns) — common multi-developer workflows
6. [Merge Conflict Expectations](#merge-conflict-expectations) — shared file conventions, concurrent sessions
7. [External Tracker Integration](#external-tracker-integration) — Jira, Linear, GitHub Issues

---

## Workflow Adaptations

How standard ARC workflows adapt when team mode is active. Detailed conventions follow
in subsequent sections and referenced documents.

| Aspect              | Solo (default)                       | Team mode                                         |
|---------------------|--------------------------------------|---------------------------------------------------|
| Session notes       | `user/{identity}/`                   | `user/{identity}/` (same structure)               |
| Work status         | `active/{category}/meta-{name}.md`   | `active/{category}/meta-{name}.md` (one per WU)   |
| ATOMIC-INBOX.md (1) | `user/{identity}/`                   | `user/{identity}/` (same structure)               |
| One task at a time  | Single pair                          | Per developer-agent pair (concurrent pairs OK)    |
| Task ownership      | Implicit                             | `(@name)` markers in task lists                   |
| Branching           | One branch per work unit             | Multiple patterns — see below                     |

(1) ATOMIC-INBOX.md requires `pm.mode: arc-in-git`. Atomic tasks as a concept (task list
sections for off-plan work) are Core and always available.

**Key distinction:** Each active work unit has its own `meta-{name}.md` in
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
   `user.notes_push: prompt` (the team default), confirm the push when prompted.

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
   readable format. This supplements the active WU's `meta-{name}.md` with qualitative
   context — decisions, gotchas, and approach notes that aren't captured in tracked artifacts.

2. **Verify task ownership.** Check the task list for `(@name)` markers confirming which tasks
   are assigned to you. The WU's `meta-{name}.md` shows the current task; the markers show
   your personal scope.

3. **Confirm understanding.** Report your understanding in the session-init orientation summary.
   If the outgoing developer is available, confirm before starting work. If not, the documents
   should stand alone — see async conventions below.

### Async Conventions

Person-to-person handoff works asynchronously — the outgoing developer may not be available
when the incoming developer starts.

- **Documents must stand alone.** SESSION-NOTES.md + the active WU's `meta-{name}.md`
  should provide complete orientation without verbal walkthrough.
- **`meta-{name}.md` provides minimum viable context.** Even without SESSION-NOTES.md, the
  project pointer (branch, task list, current task, next action) is sufficient to start work.
- **Graceful degradation.** If git notes weren't pushed, fall back to `meta-{name}.md` +
  task list + git log.
- **Questions are expected.** The incoming developer may leave questions in commit messages,
  PR comments, or team channels.

---

## Interlock-Release Coordination

Team mode does not change the interlock model: task approval, commit approval, push approval,
and integration approval keep the same meanings. It changes the coordination consequences because
other developers may be waiting on the branch or task list state.

**Task ownership before approval.** Before reporting a task complete, verify the task's `(@name)`
marker still names the current developer. Under `arc.commitInterlock ∈ {on-task-approval,
on-workflow}`, approval may immediately produce a commit, so a stale ownership marker becomes
committed shared state instead of a local note. Reassignment remains a task-list edit; make it
before the completion report when ownership changed during the work.

**Manual commit mode.** With `arc.commitInterlock: manual`, task completion can leave code
and task-list checkbox updates uncommitted until the user explicitly asks for a commit. In team
mode, that state is local only. Handoffs should either commit the reviewed work first or describe
the uncommitted state clearly in SESSION-NOTES so the next developer does not assume the branch
already carries it.

**Commit-on-task-approval mode.** With `arc.commitInterlock: on-task-approval` (or
`on-workflow`, which adds release on workflow-ceremony commits), approved tasks usually land as
task-sized commits immediately after review. This reduces invisible local state but increases
commit frequency on shared branches. Concurrent pairs should pull before starting or committing
nearby task-list edits, and should expect straightforward checkbox/completion-note conflicts when
two owned tasks complete close together.

**Push remains separate.** A local commit is not team-visible until pushed. `arc.pushInterlock:
on-sync` releases push when an `arc sync` event fires — typically handoff-driven sync (via
`arc.syncInterlock: on-handoff`), or explicit mid-session `arc sync` invocation;
`on-workflow` adds release on workflow-driven push events. Teams that depend on a shared
integration branch should agree when mid-session pushes are expected versus when handoff-driven
push is sufficient.

**Release-wrapper opt-in is per-developer.** `arc release setup install` writes
`arc.releaseOptedIn` to local git config (per-clone, never pushed); teammates have independent
opt-in states and independent installed-harness sets. The wrappers themselves run unconditionally
regardless; opt-in changes only harness-prompt behavior on the developer's machine. There is no
project-wide opt-in switch — each teammate decides per machine whether to install per-harness
allowlists and which mode (default-prompt or bypass) to use.

**Asymmetric setup is expected.** Multi-developer repos commonly carry diverging release-wrapper
setup state per developer: different installed harnesses, different opt-in states, different
per-machine modes. This parallels the per-developer variation already accepted for interlock
settings (`arc.commitInterlock`, `arc.pushInterlock`, `arc.syncInterlock`) — autonomy and
interaction-cadence preferences are individual, not project-wide. See [Interlock Release
Wrappers Strategy][interlock-release-wrappers] for trust-model framing and per-harness setup
notes.

---

## Team Branching Patterns

These patterns build on the [branching model in the work organization strategy][work-org].
Choose the pattern that fits your team's review culture and the work at hand — patterns can
coexist within a project.

**`Branch(es):` header field:** Task lists record branches as a flat comma-separated list
(e.g., `feat/user-auth, feat/user-auth/alice, feat/user-auth/bob`). This is
intentionally flat — the list captures which branches exist, not their topology. Branch
relationships (which is the integration branch, which are sub-branches) are documented in
the branching pattern choice, not encoded in the field format.

### Shared Integration Branch

The team works off a single shared WU branch. Each developer commits directly
to the shared branch (or uses short-lived personal branches that merge into it).

```text
main
└── feat/user-authentication           # Shared — all team members commit here
```

### Personal Sub-Branches

Each developer gets a sub-branch off the shared integration branch. Work is reviewed
via PR into the shared branch before final integration.

```text
main
└── feat/user-authentication           # Integration branch
    ├── feat/user-auth/alice           # Alice's working branch
    └── feat/user-auth/bob             # Bob's working branch
```

### Stacked PRs per Developer

Each developer creates a sequence of stacked branches for their portion of the work,
reviewed independently. This extends the [stacked branch model][work-org] from solo
to team use.

```text
main
└── feat/user-authentication                 # Integration branch
    ├── feat/user-auth/alice-models          # Alice's first PR
    │   └── feat/user-auth/alice-api         # Alice's second PR (stacked)
    └── feat/user-auth/bob-frontend          # Bob's work
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

Per-WU meta files (`active/{category}/meta-{name}.md`) are tracked and shared across
developers working on the same WU. Parallel work units on independent branches never collide
at the meta-file layer — each WU carries its own file, and merges to the base branch never
touch the same path from both sides. Within-WU coordination (team sub-branches sharing one
meta file) resolves through normal git merge behavior: non-overlapping field edits merge
cleanly, field-level collisions surface as merge conflicts that the integration branch owner
resolves manually. `(@name)` marker discipline on task lists minimizes meta-file field
overlap in practice, and the meta-file timing rule (see [DEV-RULES.ARC][dev-methodology]
§ Commit Discipline) narrows the write surface further — the file is touched only at
handoff and workflow-ceremony commits, so concurrent same-field writes are rare.

See [Work Organization Strategy][work-org] § Task Lists and Branches for the full merge
convention.

### Concurrent Sessions

Sequential handoff (Alice finishes, Bob starts) is the common pattern. When multiple
developers work simultaneously, two different topologies carry different coordination
properties — address them separately.

**Parallel work units on independent branches.** Alice works on
`feat/auth-refresh` with its own `meta-auth-refresh.md`; Bob works on
`chore/ci-matrix` with its own `meta-ci-matrix.md`. The work units don't coordinate at
all at the meta-file layer: different files, different branches, different task lists.
Independent WUs merge to the base branch without ever touching each other's meta files.
This is the dominant pattern for parallel solo work on independent concerns.

**Within-WU team sub-branches.** Alice and Bob both work on the same WU via personal
sub-branches (`feat/user-auth/alice`, `feat/user-auth/bob`) off a shared integration
branch. They share one `meta-{name}.md`. Coordination mechanisms:

- **Task list:** Each developer works their `(@name)`-assigned tasks. Conflicts only arise
  when both commit task list updates at the same time — pull before committing to reduce
  conflict frequency. Remaining conflicts are resolved as described under
  [Task Lists Are Shared Files](#task-lists-are-shared-files).
- **Meta file (`meta-{name}.md`):** Shared write surface. Non-overlapping field edits
  merge cleanly; concurrent edits to the same field (e.g., both advancing `Next Task`)
  produce a merge conflict that the integration branch owner resolves manually. Last
  committer's update wins as the default convention when edits are compatible — each
  developer resolves their personal next task from `(@name)` markers at session-init and
  doesn't depend on the shared meta file for personal state.
- **SESSION-NOTES.md:** No conflict possible — each developer writes to their own
  `user/{identity}/` directory.

### Cross-WU Planning Dependencies

Parallel work units on independent branches don't coordinate at the meta-file layer (above), but
**planning artifacts within those WUs can still create dependencies**: one developer's WU may
reference design decisions, scope choices, or task structures in another's evolving plan-doc. Each
WU's planning artifacts live on its branch — a developer's worktree holds a sibling WU's state as
of her branch creation plus any explicit fetches, not the sibling's current state.

Mechanisms:

- **Out-of-band coordination (default):** Discuss the dependency at planning time — Slack, standup,
  or direct conversation. This is the modal answer for inter-WU planning concurrency across
  agentic-coding practice and remains the recommended default for ARC teams.
- **Cross-branch reads:** `git show <branch>:<path>` retrieves a file from any branch without
  checkout. Useful for ad-hoc reference but ergonomically rough as a steady-state pattern.
- **Explicit sequencing:** If a WU pair's coupling is tight enough that planning-state drift would
  cause real downstream rework, treat that as a signal to either (a) merge the WUs into one, or
  (b) bring the coupling to the team for explicit sequencing decision (one WU graduates to
  execution before the other begins planning).

For most teams, out-of-band coordination is sufficient. Codified inter-WU sync primitives are a
future-ARC concern — see `plan-arc-backend.md` for the architectural answer to coordination needs
that exceed Git's affordances.

### Configuration Notes

**`user.notes_push` and team mode:** When `arc init` sets `team.mode: true`, it defaults
`user.notes_push` to `prompt` (ask before pushing session notes). If you toggle `team.mode`
after init by editing `arc-config.yml`, `user.notes_push` is not automatically updated — check
and adjust it manually. Per-developer override: `git config arc.notesPush <manual|on-sync|prompt>`.

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
[interlock-release-wrappers]: strategy-interlock-release-wrappers.md
[process-task-loop]: ../../../system/workflows/arc/3_process-task-loop.md
[session-handoff]: ../../../system/workflows/arc/session-lifecycle/session-handoff.md
[session-init]: ../../../system/workflows/arc/session-lifecycle/session-init.md
[arc-extensions-dir]: ../../../system/extensions/
[arc-ext-task-completion]: ../../../system/extensions/post-task-completion.md
[arc-ext-wu-activate]: ../../../system/extensions/post-work-unit-activate.md
[arc-ext-wu-archive]: ../../../system/extensions/post-work-unit-archive.md
