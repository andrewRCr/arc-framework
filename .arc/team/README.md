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
├── ATOMIC-TASKS.template.md           # Template: copied into member dirs (arc-in-git only)
├── SESSION-NOTES.template.md          # Template: copied into member dirs
├── alice/
│   ├── SESSION-NOTES.md              # Alice's session context (gitignored)
│   └── ATOMIC-TASKS.md              # Alice's one-off tasks (arc-in-git only)
└── bob/
    ├── SESSION-NOTES.md              # Bob's session context (gitignored)
    └── ATOMIC-TASKS.md              # Bob's one-off tasks (arc-in-git only)
```

**Naming convention:** `team/{name}/` is the default. Nested groupings
(e.g., `team/frontend/alice/`) are supported for larger teams — the structure adapts
to however you organize people.

## What Lives Where

| Location       | Contains                                  | Ownership                             |
|----------------|-------------------------------------------|---------------------------------------|
| `active/`      | Task lists, PRDs, work artifacts          | Communal — shared by all team members |
| `active/`      | WORK-STATUS.md                            | Shared — one per branch, tracked      |
| `team/{name}/` | SESSION-NOTES.md, ATOMIC-TASKS.md         | Personal — one member's state         |
| `backlog/`     | ROADMAP, backlogs                         | Communal — shared by all team members |

**Why the separation:** SESSION-NOTES.md is inherently personal — two developers can't share
session context. ATOMIC-TASKS.md is personal task tracking. Splitting these into `team/`
eliminates file-level merge conflicts between team members while keeping shared artifacts
(including WORK-STATUS.md) in their natural communal location. WORK-STATUS.md is shared because
it's branch-scoped factual state, not personal context.

## Solo vs. Team Mode

**Solo (default):** Session state lives in `active/WORK-STATUS.md` (tracked) and
`active/SESSION-NOTES.md` (gitignored). With `pm.mode: arc-in-git`, `active/ATOMIC-TASKS.md`
tracks standalone tasks. No `team/` directory needed.

**Team:** Personal files move to `team/{name}/` — SESSION-NOTES.md and (with
`pm.mode: arc-in-git`) ATOMIC-TASKS.md. WORK-STATUS.md stays in `active/` (shared, one per
branch). The `active/` directory continues to hold communal work artifacts (task lists, PRDs).

**Transition:** Migration from solo to team mode is handled by the CLI. See
`plan-distribution-and-update-system.md` for implementation notes.

## Agent Lookup

Agents find their session state via predictable paths:

- **Solo mode:** `active/WORK-STATUS.md` + `active/SESSION-NOTES.md`
- **Team mode:** `active/WORK-STATUS.md` (shared) + `team/{name}/SESSION-NOTES.md` (personal) —
  the member name is established at session start (configured in the agent's environment or
  provided by the developer)

Session initialization (`session-init.md`) references both files by path. In team mode, only
SESSION-NOTES.md changes path — from `active/` to `team/{name}/`. WORK-STATUS.md stays in
`active/` because it's branch-scoped factual state, not personal context.

## Templates

The `.template.md` files in this directory are copy sources — CLI copies them into
`team/{name}/` when adding a member, renaming by removing `.template`. Agents don't interact
with the templates directly; they work with the instantiated copies in member directories.

- **SESSION-NOTES.template.md** — Always installed (Core). Personal session context, gitignored.
- **ATOMIC-TASKS.template.md** — Installed only with `pm.mode: arc-in-git`. Per-developer
  standalone task tracking.
