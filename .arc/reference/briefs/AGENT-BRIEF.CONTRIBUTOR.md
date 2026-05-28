# AGENT-BRIEF.CONTRIBUTOR.md — Contributor Role Orientation

This briefing applies when `git config arc.role` is set to `contributor`. It replaces the
maintainer-focused session initialization (meta files, task lists, task execution workflow)
with a streamlined context appropriate for contributing to an ARC-managed project.

## What Contributors Do

Contributors work on project code — features, bug fixes, documentation improvements — without
managing the upstream project's planning and tracking artifacts.

## Boundaries

**Do not modify** files in `.arc/active/` or `.arc/backlog/` — these are maintainer-managed
artifacts. The pre-commit hook warns if you stage files in these directories.

**The boundary is ownership of tracked state**, not the presence of WU concepts. You can run
ARC's planning pipeline scoped to your personal workspace at `.arc/user/{identity}/`. See
[contributor boundaries][TODO-docs-site] for the read-vs-write split on upstream's `.arc/` tree.

**Quality gates apply in full** — see [DEV-RULES.PROJECT][dev-rules-project].

## Commit Convention

Use the `Context: contribution (...)` footer with a freeform parenthetical describing the change.
Subject line follows the same rules as maintainer commits ([arc-config.yml][arc-config] →
`commit.format`, conventional commits by default). See [contributor commit example][TODO-docs-site]
for a worked example.

## Session Workflow

Contributor sessions follow [session-init][session-init] and [session-handoff][session-handoff]
with the contributor path. Personal active state under `user/{identity}/active/` mirrors maintainer
structure (flat — no category subdir): `meta-{name}.md` per in-flight contribution plus optional
companion files. Loaded if present; absent state is fine for ad-hoc contributions.
See [contributor session lifecycle][TODO-docs-site] for the full load set, skipped artifacts, and
handoff differences.

## Personal Workspace: The Framework Read Contract

ARC reads from a defined set of paths inside `.arc/user/{identity}/`; everything else is freeform
contributor-managed content. See [personal workspace][TODO-docs-site] for the full read contract,
recommended directory layout, and rationale.

**Framework-managed reads:**

- `SESSION-NOTES.md` — session context, loaded at session-init, written at session-handoff
- `ATOMIC-INBOX.md` — personal capture queue (arc-in-git upstream projects only)
- `active/meta-{name}.md` — personal active work state for an in-flight contribution (optional)
- `active/tasks-{name}.md` + `notes-{name}.md` — task list and notes companion when
  running a full planning pipeline

**Guardrails:**

- Don't shadow framework-managed paths with conflicting personal content
- Don't expect ARC to load arbitrary files outside the paths above
- Don't introduce hooks, workflows, or session-init-loaded content under `user/{identity}/` —
  those live in framework-tracked `.arc/system/` and cannot be overridden personally

## Running a Full Planning Pipeline Locally

For substantial contributions you can run ARC's full planning pipeline scoped to
`.arc/user/{identity}/`. Same workflows as maintainers; they resolve paths based on `arc.role`.
See [contributor planning pipeline][TODO-docs-site] for the layout, ceremony, archival options,
and role-transition guidance.

---

_This briefing is loaded during session initialization when `arc.role = contributor`.
Maintainer sessions load the full document set instead. See
[session-init][session-init] for the complete initialization protocol. Contributor concepts
are explained in [user/README.md][user-readme] for human reference._

---

[arc-config]: ../../system/arc-config.yml
[dev-rules-project]: ../../system/rules/DEV-RULES.PROJECT.md
[session-init]: ../../system/workflows/arc/session-lifecycle/session-init.md
[session-handoff]: ../../system/workflows/arc/session-lifecycle/session-handoff.md
[user-readme]: ../../user/README.md

[TODO-docs-site]: # "Placeholder pending docs-content-sweep — see notes-docs-content-sweep.md"
