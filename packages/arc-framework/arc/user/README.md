# Personal Workspace

**Audience:** Human-facing — read when setting up or understanding per-developer workspace structure.

This directory provides each developer with a personal workspace for session state and
lightweight personal content. The structure is the same whether you're working solo or on a
team — each developer gets a `user/{identity}/` subdirectory.

**What belongs here:** session notes, personal task capture, freeform scratch notes, personal
reference material — per-developer content that doesn't belong in the shared repo.

**What does NOT belong here (for most users):** task lists, PRDs, work unit artifacts, per-WU
status files. Those are project-level and live in `.arc/active/{category}/` — shared, tracked,
visible to the whole team. There is one niche exception for contributors running a personal
planning pipeline, described at the end of this doc.

## How It Works

CLI init creates a personal subdirectory using your identity (from `git config arc.identity`,
configured during initial setup):

```text
user/
├── README.md                    # This file (tracked)
├── andrew/                      # Your personal workspace (gitignored)
│   ├── SESSION-NOTES.md         # Session context across sessions
│   └── ATOMIC-INBOX.md          # Personal task capture (arc-in-git only)
└── alice/                       # Team member (same structure)
    └── ...
```

**Solo projects** have one identity directory. **Team projects** have one per developer. The
structure is identical — team scaling requires no migration. Add team members with
`arc user add <identity>`.

## What Lives Where

| Location           | Contains                                              | Ownership                            |
|--------------------|-------------------------------------------------------|--------------------------------------|
| `active/`          | Task lists, PRDs, status files, work unit artifacts   | Project-level — shared, tracked      |
| `backlog/`         | ROADMAP, backlogs                                     | Project-level — shared, tracked      |
| `user/{identity}/` | Session notes, personal captures, freeform notes      | Personal — one developer, gitignored |

**Why the separation:** personal content is gitignored so it doesn't create merge conflicts
between developers. Project-level planning artifacts stay in their natural shared locations
where the whole team can see them.

**Common point of confusion:** task lists and work unit files are *project-level*. They live in
`.arc/active/`, not in `user/{identity}/`. The user directory is for personal content that
shouldn't leave your machine by default.

## Framework Read Contract

ARC loads from specific files in your workspace during session lifecycle operations. These are
the only paths the framework actively manages; everything else you put here is freeform.

| Path               | Loaded at    | Purpose                                                         |
|--------------------|--------------|-----------------------------------------------------------------|
| `SESSION-NOTES.md` | session-init | Session context from prior sessions; written at session-handoff |
| `ATOMIC-INBOX.md`  | session-init | Personal task capture queue (arc-in-git only)                   |

That's the whole contract for most users. If you're running a personal planning pipeline as a
contributor, `WORK-STATUS.md` and `active/tasks-*.md` are additional optional paths — see
§ Advanced: Personal Planning Pipeline below.

## Personal Content

Everything else under `user/{identity}/` is yours to organize. Typical examples: scratch notes,
investigation logs, research captures, reference links, personal reading lists, clippings. No
structural requirements — put things where they make sense to you.

The framework does not load, validate, or manage personal content. You can reorganize it,
delete it, or expand it without breaking anything.

**Light recommendation:** when your workspace grows past a few files, consider mirroring ARC's
tracked directory layout (`reference/`, `reference/archive/`, etc.) as a personal organizing
convention. It keeps your mental model consistent and is strictly optional — ARC doesn't enforce
or validate the structure of this gitignored directory.

## Portability

Personal workspace files are gitignored — they don't leave your machine by default. For
cross-machine or team handoff, ARC uses git notes to attach the entire `user/{identity}/`
directory to commits without creating merge conflicts. See `arc-config.yml` for
`user.sync_push` behavior (always / prompt / manual).

CLI commands: `arc user save`, `arc user load`, `arc user push`, `arc user pull`, `arc sync`.

## Adding Team Members

Run `arc user add <identity>` to create a new `user/{identity}/` directory with the standard
workspace files. The CLI populates the directory from its internal templates — no manual file
copying needed.

## Advanced: Personal Planning Pipeline

> **Niche use case.** Most users can stop reading here.

Contributors to an ARC-using upstream project can optionally run ARC's full planning pipeline —
plan docs, PRDs, task lists, shift lifecycle, handoffs — scoped entirely to their
`user/{identity}/` workspace, without touching upstream's tracked planning state. This is the
exception to "task lists live in project `active/`": when running as a contributor, your
personal task lists live in `user/{identity}/active/` and are loaded by session-init if your
role is `contributor`.

This is an opt-in advanced pattern documented in full by the contributor briefing
(`system/agent/AGENT-BRIEFING.CONTRIBUTOR.md`, loaded automatically during contributor-role
sessions). Maintainers do not use this path — project planning state belongs in `.arc/active/`
where the team can see it.
