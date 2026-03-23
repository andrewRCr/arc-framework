# Personal Workspace

**Audience:** Human-facing — read when setting up or understanding per-developer workspace structure.

This directory provides each developer with a personal workspace for session state and
lightweight task capture. The structure is the same whether you're working solo or on a team —
each developer gets a `user/{identity}/` subdirectory.

## How It Works

CLI init creates a personal subdirectory using your identity (from `git config arc.identity`,
configured during initial setup):

```text
user/
├── README.md                    # This file (tracked)
├── andrew/
│   ├── SESSION-NOTES.md         # Session context (gitignored)
│   └── ATOMIC-INBOX.md          # One-off task capture (arc-in-git only, gitignored)
└── alice/                       # Team member (same structure)
    ├── SESSION-NOTES.md
    └── ATOMIC-INBOX.md
```

**Solo projects** have one identity directory. **Team projects** have one per developer. The
structure is identical — team scaling requires no migration. Add team members with
`arc user add <identity>`.

## What Lives Where

| Location           | Contains                          | Ownership                             |
| ------------------ | --------------------------------- | ------------------------------------- |
| `active/`          | Task lists, PRDs, work artifacts  | Communal — shared by all team members |
| `active/`          | WORK-STATUS.md                    | Shared — one per branch, tracked      |
| `user/{identity}/` | SESSION-NOTES.md, ATOMIC-INBOX.md | Personal — one developer's state      |
| `backlog/`         | ROADMAP, backlogs                 | Communal — shared by all team members |

**Why the separation:** Personal files (session context, task capture) are gitignored to
eliminate merge conflicts between developers. Communal artifacts (task lists, WORK-STATUS.md)
stay in their natural shared locations.

## Portability

Personal workspace files are gitignored — they don't leave your machine by default. For
cross-machine or team handoff, ARC uses git notes to attach the entire `user/{identity}/`
directory to commits without creating merge conflicts. See `arc-config.yml` for
`user.sync_push` behavior (always / prompt / manual).

CLI commands: `arc user save`, `arc user load`, `arc user push`, `arc user pull`, `arc sync`.

## Agent Lookup

Agents find session state via predictable paths:

- **WORK-STATUS.md** → `active/WORK-STATUS.md` (shared, tracked)
- **SESSION-NOTES.md** → `user/{identity}/SESSION-NOTES.md` (personal, gitignored)

Identity is resolved at session start via `git config arc.identity`. Session initialization
(`session-init.md`) references both files by path.

## Adding Team Members

Run `arc user add <identity>` to create a new `user/{identity}/` directory with the standard
workspace files. The CLI populates the directory from its internal templates — no manual file
copying needed.
