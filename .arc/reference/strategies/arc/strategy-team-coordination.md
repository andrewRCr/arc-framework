# Strategy: Team Coordination

> **Guide and rationale:** [Team Coordination](https://andrewrcr.github.io/arc-framework/reference/team-coordination/)
> on the docs site covers branching pattern trade-offs, merge conflict expectations, and
> tracker complementarity reasoning.

Cross-person coordination conventions for ARC projects with more than one developer. Covers ownership,
person-to-person handoff, interlock-release coordination, merge conflict expectations, and external
tracker integration.

These conventions activate when `team.mode: true` is set in `arc-config.yml`. Some structural
foundations are always present regardless of team mode — per-identity `user/{identity}/` directories,
per-WU `meta-{name}.md` files in `active/`. Team parallelism comes from **multiple single-owner work
units across identities** (separate branches, separate worktrees), not from multiple developers driving
one work unit; the per-WU concurrency mechanics live in [Concurrent Work][concurrent-work]. The
conventions below add the cross-person layer on top.

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
2. [Ownership](#ownership) — meta `**Owner:**` field
3. [Person-to-Person Task Handoff](#person-to-person-task-handoff) — transferring work between developers
4. [Interlock-Release Coordination](#interlock-release-coordination) — commit/push settings in team mode
5. [Merge Conflict Expectations](#merge-conflict-expectations) — shared file conventions, concurrent sessions
6. [External Tracker Integration](#external-tracker-integration) — Jira, Linear, GitHub Issues

---

## Workflow Adaptations

How standard ARC workflows adapt when team mode is active. Detailed conventions follow
in subsequent sections and referenced documents.

| Aspect              | Solo (default)           | Team mode                                       |
|---------------------|--------------------------|-------------------------------------------------|
| Session notes       | `user/{identity}/`       | `user/{identity}/` (same structure)             |
| Work status         | `active/meta-{name}.md`  | `active/meta-{name}.md` (one per WU)            |
| ATOMIC-INBOX.md (1) | `user/{identity}/`       | `user/{identity}/` (same structure)             |
| Branching           | One branch per work unit | One branch per WU; parallelism via multiple WUs |

(1) ATOMIC-INBOX.md requires `pm.mode: arc-in-git`. Atomic tasks as a concept (task list
sections for off-plan work) are Core and always available.

**Key distinction:** Each active work unit has its own `meta-{name}.md` in
`active/`, tracked in git. It represents **WU-level state** owned by the WU's single
owner — "Next Task" is the WU's next incomplete task. Personal files (SESSION-NOTES.md,
ATOMIC-INBOX.md) live in `user/{identity}/` and are gitignored — no merge conflicts between
developers. The `user/` directory structure is identical for solo and team; team scaling
requires only adding identity directories. See `user/README.md` for the full directory structure.

---

## Ownership

Every work unit has a **single owner** — one Directly Responsible Individual (DRI) accountable for the
work unit end to end. The meta `**Owner:**` field in `active/meta-{name}.md` *is* the assignment and the
single source of assignment truth. Ownership is carried at work-unit granularity, not per task: a WU's
tasks all belong to its one owner, so task lists carry no per-task ownership marker.

Non-owner contribution happens through three channels:

- **PR review** — first-class and unchanged; anyone can review the owner's pull request.
- **Pairing** — synchronous work with a single driver. Credit co-contributors with `Co-authored-by:`
  trailers on the relevant commits; this is an attribution convention, not a structural role.
- **Handoff** — transferring a work unit to a new owner is a *sequential reassignment* of the
  `**Owner:**` field, never concurrent shared ownership. See
  [Person-to-Person Task Handoff](#person-to-person-task-handoff).

Cross-person parallelism comes from running **multiple single-owner work units across identities**, not
from multiple developers driving one WU's task list. When work surfaces that belongs to a *different*
owner's work unit, the self/foreign asymmetry and the all-owner gate in [Concurrent Work][concurrent-work]
govern it — reorder and re-home your own work freely; foreign-owned work you coordinate, not appropriate.

---

## Person-to-Person Task Handoff

A structured approach for transferring active work between developer-agent pairs — vacation,
rotation, workload rebalancing, or specialization change. Distinct from normal session handoff
(same person, different session) in that the *reader changes*, not just the time boundary.

This protocol composes the existing [session-handoff][session-handoff] and
[session-init][session-init] workflows with enhanced context for the different reader. No new
ceremony — the standard workflows apply with the adjustments below. Teams can follow this
fully, partially, or rely on informal coordination — the minimum viable handoff is reassigning
the meta `**Owner:**` field and pushing session notes.

### Outgoing Responsibilities

The outgoing developer runs a standard session handoff with these additions:

1. **Reassign ownership.** Update the meta `**Owner:**` field in `active/meta-{name}.md` to the
   incoming developer — the single source of assignment truth. A one-field edit transfers the
   whole work unit; it's visible to anyone reading the tracked meta file and doesn't require
   fetching session notes.

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

2. **Verify ownership.** Check the WU's `meta-{name}.md` `**Owner:**` field to confirm the work
   unit is now assigned to you; it also shows the current task and next action.

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

**Manual commit mode.** With `arc.commitInterlock: manual`, task completion can leave code
and task-list checkbox updates uncommitted until the user explicitly asks for a commit. In team
mode, that state is local only. Handoffs should either commit the reviewed work first or describe
the uncommitted state clearly in SESSION-NOTES so the next developer does not assume the branch
already carries it.

**Commit-on-task-approval mode.** With `arc.commitInterlock: on-task-approval` (or
`on-workflow`, which adds release on workflow-ceremony commits), approved tasks usually land as
task-sized commits immediately after review. This reduces invisible local state but increases
commit frequency.

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

## Merge Conflict Expectations

### Session State Merge Behavior

Personal files in `user/{identity}/` (SESSION-NOTES.md and, with `pm.mode: arc-in-git`,
ATOMIC-INBOX.md) are gitignored — no merge conflicts by design. Only one developer writes to
each identity directory.

### Concurrent Sessions

Team parallelism runs as **multiple single-owner work units on independent branches** — each with its
own `meta-{name}.md`, task list, and (typically) worktree. Independent WUs never collide at the
meta-file layer: different files, different branches, merged to the base without touching each other's
paths. The mechanics of running them concurrently — rebase cadence, append-only discipline, merge
ordering, worktree operations — live in [Concurrent Work][concurrent-work]; team mode adds the
cross-identity coordination layer on top.

### Cross-WU Planning Dependencies

Parallel work units on independent branches don't coordinate at the meta-file layer (above), but
**planning artifacts within those WUs can still create dependencies**: one developer's WU may
reference design decisions, scope choices, or task structures in another's evolving draft-doc. Each
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
  (b) bring the coupling to the team for explicit sequencing decision (one WU advances to
  execution before the other begins planning).

For most teams, out-of-band coordination is sufficient. Codified inter-WU sync primitives are a
future-ARC concern — see `draft-arc-backend.md` for the architectural answer to coordination needs
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
| Task assignment       | Primary (who owns what)      | WU-level via meta `**Owner:**` field |
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

No extension points are needed for task *assignment* — the meta `**Owner:**` field (WU-level) and
external tracker assignment serve different audiences and don't need real-time sync.

---

## Related Documentation

- [Work Organization Strategy][work-org] — Branching model, work categories, protection modes
- [Concurrent Work][concurrent-work] — Multi-WU concurrency mechanics; the orthogonal sibling to team mode
- [DEV-RULES.ARC][dev-methodology] — Task management protocol, commit standards
- [Process Task Loop][process-task-loop] — Task execution workflow
- `user/README.md` — Per-developer workspace structure and session state

---

[work-org]: strategy-work-organization.md
[concurrent-work]: strategy-concurrent-work.md
[dev-methodology]: ../../../system/rules/DEV-RULES.ARC.md
[interlock-release-wrappers]: strategy-interlock-release-wrappers.md
[process-task-loop]: ../../../system/workflows/arc/process-task-loop.md
[session-handoff]: ../../../system/workflows/arc/session-lifecycle/session-handoff.md
[session-init]: ../../../system/workflows/arc/session-lifecycle/session-init.md
[arc-extensions-dir]: ../../../system/extensions/
[arc-ext-task-completion]: ../../../system/extensions/post-task-completion.md
[arc-ext-wu-activate]: ../../../system/extensions/post-work-unit-activate.md
[arc-ext-wu-archive]: ../../../system/extensions/post-work-unit-archive.md
