# Personal Workspace

**Audience:** Human-facing — read when setting up or understanding per-developer workspace structure.

This directory provides each developer with a personal workspace for lightweight personal content. The structure is
the same whether you're working solo or on a team — each developer gets a `user/{identity}/` subdirectory.

**What belongs here:** working memory, personal task capture, freeform scratch notes, personal reference material —
per-developer content that isn't the shared project's.

Work-unit task lists, PRDs, and meta files are project-level records. ARC projects active work-unit records into
`.arc/active/` and shares them with the team.

## How It Works

ARC stores each developer's personal records under their identity (from `git config arc.identity`, configured during
initial setup). ARC projects only the current identity's personal records into `user/{identity}/` in each checkout:

```text
user/
├── README.md                    # This file (tracked)
└── andrew/                      # Your personal workspace
    ├── WORKING-MEMORY.md        # Cross-work-unit context, reviewed at each handoff
    ├── USER-INBOX.md            # Personal task capture, read with `arc inbox personal`
    └── scratch/                 # Your own files
```

The checkout layout is the same for solo and team projects. Add team members with `arc user add <identity>`.

## What Lives Where

| Location           | Contains                                            | Ownership                         |
| ------------------ | --------------------------------------------------- | --------------------------------- |
| `active/`          | Task lists, PRDs, meta files, work unit artifacts   | Project-level — shared, projected |
| `backlog/`         | Backlog stubs and drafts                            | Project-level — shared, projected |
| `user/{identity}/` | Working memory, personal captures, `scratch/` files | Personal — one developer          |

**Why the separation:** each developer writes only their own personal records, so personal content never conflicts
between developers. Project-level planning records stay in their shared locations where the whole team can see them.

**Common point of confusion:** task lists and work unit files are _project-level_. They live in
`.arc/active/`, not in `user/{identity}/`.

## Framework Read Contract

ARC manages these personal records during session lifecycle operations; everything you put in `scratch/` is freeform.

| Record              | Read at                     | Purpose                                                    |
| ------------------- | --------------------------- | ---------------------------------------------------------- |
| `WORKING-MEMORY.md` | session-init                | Cross-work-unit constraints, each with its removal trigger |
| Personal inbox      | `arc inbox personal`, drain | Deferred personal captures, drained by `arc-housekeep`     |

Contributor session entry can also read a local `user/{identity}/active/meta-{name}.md`. Work-unit handoff
requires a held store record, so a contributor with only local planning files follows the
[between-work-units handoff][between-work-units]. Use the personal inbox for deferred work, working memory for
approved cross-work-unit context, and `scratch/` for portable freeform planning notes.

## Personal Content

Use `user/{identity}/scratch/` for freeform text such as notes, investigation logs, research captures, and reference
links. Keep each file to at most 1 MiB (1,048,576 UTF-8 bytes). The store rejects files with a NUL byte in the first
8,000 bytes. Outside `scratch/`, the identity directory holds only ARC's records, and a save refuses other files there.

## Portability

Your personal records, including accepted `scratch/` files, are stored under your identity beside the project's state.
A scratch edit becomes available to sync on another machine after the store accepts it through `arc save` and
`arc sync` publishes it to the state remote. Anyone with read access to the designated state remote can read published
personal records. In the default setup, state uses the code repository's remote, so a public code repository makes
those records public. A separate state repository can be private even when the code repository is public. In local-only
mode, ARC publishes no state. Keep secrets out of your personal workspace.

## Adding Team Members

Run `arc user add <identity>` to set up a new developer's personal records. It creates only records that do not
exist yet, so it never overwrites anyone's content.

---

[between-work-units]: ../system/workflows/arc/session-lifecycle/session-handoff.md#between-wus-handoff-path
