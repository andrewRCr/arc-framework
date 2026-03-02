# Team Coordination

**Audience:** Human-facing — read when evaluating or enabling team mode.

This directory supports multi-developer projects where each developer (with their AI agent)
needs independent session state. It ships as scaffolding — CLI init creates the structure
when team mode is selected. Solo projects don't use this directory.

## How It Works

Each team member gets a personal subdirectory containing their own session state:

```text
team/
├── README.md                          # This file
├── WORK-STATUS.template.md            # Template: copied into member dirs
├── ATOMIC-TASKS.template.md           # Template: copied into member dirs
├── alice/
│   ├── WORK-STATUS.md                 # Alice's tracked project state
│   ├── SESSION.md                     # Alice's session context (gitignored)
│   └── ATOMIC-TASKS.md               # Alice's one-off tasks
└── bob/
    ├── WORK-STATUS.md                 # Bob's tracked project state
    ├── SESSION.md                     # Bob's session context (gitignored)
    └── ATOMIC-TASKS.md               # Bob's one-off tasks
```

**Naming convention:** `team/{name}/` is the default. Nested groupings
(e.g., `team/frontend/alice/`) are supported for larger teams — the structure adapts
to however you organize people.

## What Lives Where

| Location       | Contains                         | Ownership                             |
|----------------|----------------------------------|---------------------------------------|
| `active/`      | Task lists, PRDs, work artifacts | Communal — shared by all team members |
| `team/{name}/` | WORK-STATUS, SESSION, ATOMIC-TASKS | Personal — one member's session state |
| `backlog/`     | ROADMAP, backlogs, TASK-INBOX    | Communal — shared by all team members |

**Why the separation:** Session state (WORK-STATUS, SESSION) is inherently per-person — two
developers can't share a "current task" pointer. Splitting personal state into `team/`
eliminates file-level merge conflicts between team members' sessions while keeping shared
work artifacts in their natural communal locations.

### TASK-INBOX as Communal Capture

`backlog/TASK-INBOX.md` is the shared capture point for the whole team — any member can
add items. During weekly review (or equivalent triage cadence), captured items are either:

- **Assigned to a member's ATOMIC-TASKS** — small tasks move to `team/{name}/ATOMIC-TASKS.md`
  for personal tracking and execution
- **Promoted to backlog** — larger items become planned work in `backlog/{category}/` with
  PRDs and task lists, owned communally

This keeps TASK-INBOX as a zero-friction inbox while routing work to the right place for
execution.

## Solo vs. Team Mode

**Solo (default):** Session state lives in `active/WORK-STATUS.md` (tracked),
`active/SESSION.md` (gitignored), and `active/ATOMIC-TASKS.md`. No `team/` directory needed.

**Team:** Each member's session state moves to `team/{name}/`. The `active/` directory
continues to hold communal work artifacts (task lists, PRDs). Solo session files
(`active/WORK-STATUS.md`, `active/SESSION.md`, `active/ATOMIC-TASKS.md`) are no longer used.

**Transition:** Migration from solo to team mode is handled by the CLI. See
`plan-distribution-and-update-system.md` for implementation notes.

## Agent Lookup

Agents find their session state via a predictable path:

- **Solo mode:** `active/WORK-STATUS.md` + `active/SESSION.md`
- **Team mode:** `team/{name}/WORK-STATUS.md` + `team/{name}/SESSION.md` — the member name
  is established at session start (configured in the agent's environment or provided by the
  developer)

Session initialization (`session-init.md`) references WORK-STATUS.md and SESSION.md by path.
In team mode, the paths simply change from `active/` to `team/{name}/`.

## Templates

The `.template.md` files in this directory are copy sources — CLI copies them into
`team/{name}/` when adding a member, renaming by removing `.template`. SESSION.md has no
template (it's gitignored and free-form, created by the session handoff workflow). Agents
don't interact with the templates directly; they work with the instantiated copies in member
directories.
