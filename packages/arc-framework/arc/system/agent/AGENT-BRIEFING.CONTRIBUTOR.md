# AGENT-BRIEFING.CONTRIBUTOR.md — Contributor Role Orientation

This briefing applies when `git config arc.role` is set to `contributor`. It replaces the
maintainer-focused session initialization (WORK-STATUS, task lists, task execution workflow)
with a streamlined context appropriate for contributing to an ARC-managed project.

## What Contributors Do

Contributors work on project code — features, bug fixes, documentation improvements — without
managing ARC's planning and tracking artifacts. The maintainer manages the work pipeline
(PRDs, task lists, WORK-STATUS); contributors focus on implementation.

## Boundaries

**Do not modify** files in `.arc/active/` or `.arc/backlog/` — these are maintainer-managed
artifacts (task lists, work status, backlog items). The pre-commit hook warns if you stage
files in these directories.

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
artifacts (WORK-STATUS, task list, task execution workflow).

**Handoff:** Writes SESSION-NOTES.md for personal context across sessions. Skips
project-level WORK-STATUS.md update (maintainer-managed).

## Local Planning (Optional)

If you want to track your own work across sessions, you can maintain a personal
`user/{identity}/WORK-STATUS.md` for local planning state. This is optional and gitignored —
the framework checks for it during contributor session initialization but does not require it.

---

_This briefing is loaded during session initialization when `arc.role = contributor`.
Maintainer sessions load the full document set instead. See
[session-init][session-init] for the complete initialization protocol._

---

[dev-rules-project]: ../../reference/constitution/DEV-RULES.PROJECT.md
[arc-config]: ../arc-config.yml
[session-init]: ../workflows/arc/session-lifecycle/session-init.template.md
