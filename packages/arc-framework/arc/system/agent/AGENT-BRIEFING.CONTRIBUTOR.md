# AGENT-BRIEFING.CONTRIBUTOR.md — Contributor Role Orientation

This briefing applies when `git config arc.role` is set to `contributor`. It replaces the
maintainer-focused session initialization (WORK-STATUS, task lists, task execution workflow)
with a streamlined context appropriate for contributing to an ARC-managed project.

## What Contributors Do

Contributors work on project code — features, bug fixes, documentation improvements — without
managing the upstream project's planning and tracking artifacts. The maintainer manages the
project work pipeline (PRDs, task lists, WORK-STATUS); contributors focus on implementation and,
if they choose, on their own personal planning pipeline for their contribution work.

## Boundaries

**Do not modify** files in `.arc/active/` or `.arc/backlog/` — these are maintainer-managed
artifacts (task lists, work status, backlog items). The pre-commit hook warns if you stage
files in these directories.

**The boundary is ownership of tracked state, not the presence of WU concepts.** You may freely
run ARC's full planning pipeline (sessions, task lists, WORK-STATUS, shift, handoffs) scoped to
your personal workspace at `.arc/user/{identity}/`. Upstream's tracked `.arc/` tree provides the
constitution, strategies, agent briefings, and workflows you need — you read them, you don't
write to them.

**Quality gates apply in full.** All quality checks defined in [DEV-RULES.PROJECT][dev-rules-project]
apply to contributor work — linting, type checking, tests, build verification. The framework
streamlines contributor workflows but does not reduce quality expectations.

## Commit Convention

Use the `Context: contribution (...)` footer with a freeform description of the change:

```text
feat(auth): add password reset endpoint

- Implements POST /api/auth/reset
- Sends reset email via SendGrid integration

Context: contribution (implement password reset per issue #42)
```

The parenthetical is freeform — describe what the contribution addresses. The commit format
(subject line) follows the same rules as maintainer commits (conventional commits by default,
per [arc-config.yml][arc-config]).

## Session Workflow

**Initialization:** Loads project identity (AGENT-BRIEFING.ARC, AGENT-BRIEFING.PROJECT),
constitutional context (DEV-RULES, QUICK-REFERENCE), and this briefing. Skips maintainer
artifacts (upstream's WORK-STATUS, task list, task execution workflow). If you maintain your
own personal WORK-STATUS.md at `user/{identity}/WORK-STATUS.md`, it is loaded automatically.

**Handoff:** Writes SESSION-NOTES.md for personal context across sessions. Skips project-level
WORK-STATUS.md update (maintainer-managed). Your personal WORK-STATUS.md is updated if you're
running a full planning pipeline locally.

## Personal Workspace: The Framework Read Contract

Your `.arc/user/{identity}/` directory is a personal workspace. ARC manages reads from a defined
set of paths inside it; everything else is yours to organize freely.

**Framework-managed reads** (paths the framework loads and whose lifecycle it manages):

- `SESSION-NOTES.md` — session context, loaded at session-init, written at session-handoff
- `WORK-STATUS.md` — your personal work state, loaded at session-init if present (optional)
- `ATOMIC-INBOX.md` — personal capture queue (arc-in-git upstream projects only)
- `active/tasks-*.md` — task lists, loaded at session-init when running a full planning pipeline
  (see § Running a Full Planning Pipeline Locally below)

**User-managed content** (freeform, any structure you want):

Personal scratch notes, investigation logs, reference links, archived completed work, mirrored
strategies, personal conventions — anything else you want to put in your workspace. ARC does not
load, validate, or manage this content.

### Recommended convention: mirror ARC's structure

If you add to your workspace beyond the framework-managed paths, follow ARC's tracked directory
layout (`active/`, `reference/`, `reference/archive/`, etc.). This keeps your mental model
consistent with the framework and makes graduation from informal personal use to the full
planning pipeline natural. The recommendation is for your consistency — not for framework
functionality. ARC cannot enforce the structure of a gitignored personal directory, and making
that honest is more useful than pretending otherwise.

### Guardrails the framework depends on

- Don't place files at paths the framework manages in a way that shadows or conflicts with them
- Don't expect ARC to load arbitrary files you add — only the paths above are read
- Don't introduce hooks, workflows, or session-init-loaded content under `user/{identity}/` —
  those live in the framework's tracked `.arc/system/` and cannot be overridden personally

## Running a Full Planning Pipeline Locally

For substantial contributions — multi-week features, multi-session work, anything that benefits
from explicit planning — you can use ARC's full planning pipeline scoped entirely to
`user/{identity}/`. This uses the same workflows as maintainers; they resolve paths based on
your `arc.role` setting.

### Layout (applying the mirror-structure recommendation)

```text
.arc/user/{identity}/
  SESSION-NOTES.md            ← session context (handled automatically by session workflows)
  WORK-STATUS.md              ← your personal work state
  active/
    plan-<name>.md            ← plan doc (transient; subsumed by PRD at PRD-creation)
    prd-<name>.md             ← PRD (after plan doc is promoted)
    tasks-<name>.md           ← task list
    notes-<name>.md           ← residual non-PRD material carried forward from planning
    atomic-<name>.md          ← atomic companion file (optional)
```

### Same workflows, same ceremony as maintainers

Plan docs are transient and get subsumed by PRD creation — residual material moves into the
notes file. The PRD, task-list generation, task execution loop, session handoffs, and shift
lifecycle all operate against your personal tree when your role is contributor. Quality gates
apply in full — the same standards as maintainer work.

### Multiple concurrent plan docs

If you are exploring several contribution ideas at once, all of the plan docs live alongside
each other in `active/`. Concurrent planning at scale is arc-in-git's value proposition
(dedicated `backlog/` for staging); contributor mode and other non-arc-in-git modes are
lightweight-by-design. If flat `active/` becomes cluttered for you personally, nothing stops you
from adding `active/planning/` as a personal convention — the framework doesn't care.

### Completion and archival

When your contribution is finished and the PR is merged, there is no formal archive ceremony.
The lightweight path:

1. Delete `user/{identity}/active/` entries for the completed work, or leave them
2. Reset `user/{identity}/WORK-STATUS.md` to "no active work"
3. Move on

If you want historical reference for your own completed work, mirror ARC's archive structure
inside your workspace (`user/{identity}/reference/archive/<quarter>/<category>/`). This is a
personal choice, not a framework requirement. `git log` with your `Context: contribution (...)`
footers is a sufficient historical record for most contributors.

### Role transitions

If you become a project maintainer, change your role between work units, not during them. Set
`git config arc.role = maintainer` after completing your current contribution; ARC does not
migrate in-progress contributor state into tracked project state. Finish what you're working on
as a contributor, then promote.

---

_This briefing is loaded during session initialization when `arc.role = contributor`.
Maintainer sessions load the full document set instead. See
[session-init][session-init] for the complete initialization protocol. The personal workspace
concept (including the framework read contract and mirror-structure recommendation) is
explained in [user/README.md][user-readme] for human reference._

---

[dev-rules-project]: ../../reference/constitution/DEV-RULES.PROJECT.md
[arc-config]: ../arc-config.yml
[session-init]: ../workflows/arc/session-lifecycle/session-init.md
[user-readme]: ../../user/README.md
