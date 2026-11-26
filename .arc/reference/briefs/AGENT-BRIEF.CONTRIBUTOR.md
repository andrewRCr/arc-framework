# AGENT-BRIEF.CONTRIBUTOR.md — Contributor Role Orientation

This briefing applies when `git config arc.role` is set to `contributor`. It adds contributor boundaries to
ordinary session entry in an ARC-managed project.

## What Contributors Do

Contributors work on project code — features, bug fixes, documentation improvements — without
managing the upstream project's planning and tracking artifacts.

## Boundaries

**Do not modify** the planning records ARC projects into `.arc/active/` and `.arc/backlog/` — these are
maintainer-managed.

**Quality gates apply in full** — see [DEV-RULES.PROJECT][dev-rules-project].

## Commit Convention

Use the `Context: contribution (...)` footer with a freeform parenthetical describing the change.
Subject line follows the same rules as maintainer commits ([arc-config.yml][arc-config] →
`commit.format`, conventional commits by default). See [contributor commit example][TODO-docs-site]
for a worked example.

Under `arc.commitInterlock: on-task-approval`, commit release stages code only.

## Session Workflow

The [session-init agenda][session-init] can read an optional local `user/{identity}/active/meta-{name}.md` at entry.
A work-unit handoff requires a held store record. If you are working without a bound work unit, follow the
`between-work-units` path in [session handoff][session-handoff]. Keep deferred work in the personal inbox,
approved cross-work-unit context in working memory, and freeform planning notes in `scratch/`.

## Personal Workspace

ARC reads `WORKING-MEMORY.md` at session-init. Use `arc inbox personal` to read your personal inbox. Keep freeform
files in `user/{identity}/scratch/` so `arc save` can persist them. Hooks and workflows belong in `.arc/system/`.

---

_This briefing joins the universal reads when `arc.role = contributor`. See [session-init][session-init] for the entry
protocol and [user/README.md][user-readme] for human workspace guidance._

---

[arc-config]: ../../system/arc-config.yml
[dev-rules-project]: ../../system/rules/DEV-RULES.PROJECT.md
[session-init]: ../../system/workflows/arc/session-lifecycle/session-init.md
[session-handoff]: ../../system/workflows/arc/session-lifecycle/session-handoff.md
[user-readme]: ../../user/README.md

[TODO-docs-site]: # "Placeholder pending docs-content-sweep — see notes-docs-content-sweep.md"
