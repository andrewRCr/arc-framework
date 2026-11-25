# Personal Workspace

**Audience:** Human-facing — read when setting up or understanding per-developer workspace structure.

This directory provides each developer with a personal workspace for lightweight personal content. The structure is
the same whether you're working solo or on a team — each developer gets a `user/{identity}/` subdirectory.

**What belongs here:** working memory, personal task capture, freeform scratch notes, personal reference material —
per-developer content that isn't the shared project's.

**What does NOT belong here (for most users):** task lists, PRDs, work unit artifacts, or per-WU meta files, which
carry each work unit's session context. Those are project-level records, projected into `.arc/active/` and shared with
the whole team. There is one niche exception for contributors running a personal planning pipeline, described at the
end of this doc.

## How It Works

ARC stores each developer's personal records under their identity (from `git config arc.identity`, configured during
initial setup) and projects them into `user/{identity}/` in every checkout:

```text
user/
├── README.md                    # This file (tracked)
├── andrew/                      # Your personal workspace
│   ├── WORKING-MEMORY.md        # Cross-work-unit context, reviewed at each handoff
│   ├── USER-INBOX.md            # Personal task capture, read with `arc inbox personal`
│   └── scratch/                 # Your own files
└── alice/                       # Team member (same structure)
    └── ...
```

**Solo projects** have one identity directory. **Team projects** have one per developer. The
structure is identical — team scaling requires no migration. Add team members with
`arc user add <identity>`.

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

That's the whole contract for most users. If you're running a personal planning pipeline as a
contributor, `user/{identity}/active/meta-{name}.md` (personal work state) and
`user/{identity}/active/tasks-{name}.md` plus companion files are additional optional paths —
see § Advanced: Personal Planning Pipeline below.

## Personal Content

Use `user/{identity}/scratch/` for freeform text such as notes, investigation logs, research captures, and reference
links. Keep each file to at most 1 MiB (1,048,576 UTF-8 bytes). The store rejects files with a NUL byte in the first
8,000 bytes. Outside `scratch/`, the identity directory holds only ARC's records, and a save refuses other files there.

## Portability

Your personal records, including accepted `scratch/` files, are stored under your identity beside the project's state.
A scratch edit becomes available to sync on another machine after the store accepts it through `arc save` and
`arc sync` publishes it to the state remote. The state remote for a public repository is public too, so keep secrets
out of your personal workspace.

## Adding Team Members

Run `arc user add <identity>` to set up a new developer's personal records. It creates only records that do not
exist yet, so it never overwrites anyone's content.

## Advanced: Personal Planning Pipeline

> **Niche use case.** Most users can stop reading here.

Contributors to an ARC-using upstream project can optionally run ARC's full planning pipeline —
plan docs, PRDs, task lists, shift lifecycle, handoffs — scoped entirely to their
`user/{identity}/` workspace, without touching upstream's tracked planning state. This is the
exception to "task lists live in project `active/`": when running as a contributor, your
personal task lists live in `user/{identity}/active/` and are loaded by session-init if your
role is `contributor`.

This is an opt-in advanced pattern documented in full by the contributor briefing
(`reference/briefs/AGENT-BRIEF.CONTRIBUTOR.md`, loaded automatically during contributor-role
sessions). Maintainers do not use this path — project planning state belongs in `.arc/active/`
where the team can see it.
