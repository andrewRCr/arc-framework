---
name: session-state
description: Read and write session state across handoffs via tracked and gitignored files plus git notes
has-override: false
---

# Method: session-state

> - **Workflow:** [session-init.md][session-init], [session-handoff.md][session-handoff]
> - **When:** Agent reads or writes session state
>
> - **Contract:** Preserve session context across handoffs. State must be recoverable by a new agent or session.

## session-state.override

[No override configured]

## session-state.default

Read/write session state at session boundaries:

- **`status-{name}.md`** (`active/{category}/`) — tracked per-WU project pointer. The
  `**State:**` field is the load-bearing lifecycle marker; see the status file template for
  the full field set. Updated at commit time and handoff.
- **SESSION-NOTES.md** (`user/{identity}/`) — gitignored personal context, written at handoff
- **Git notes** (`refs/notes/arc/user/{identity}`) — portability layer for the user directory.
  Save at handoff, load at init when local files are missing or stale. Push per `user.sync_push`
  config (`always` / `prompt` / `manual`; per-developer override via `git config arc.sync_push`).

---

[session-init]: ../workflows/arc/session-lifecycle/session-init.md
[session-handoff]: ../workflows/arc/session-lifecycle/session-handoff.md
