---
name: session-state
description: Read and write session state across handoffs through the work unit's stored meta and personal records
override-active: false
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

- **The work unit's meta** — its stored record, projected into the work unit's checkout. The `**State:**` field is the
  load-bearing lifecycle marker; see the meta file template for the full field set. Its handoff — `Next Action`, an
  optional `Session Type`, and the `## Session Context` section of personal working context — is written whole at
  handoff by `arc handoff write`, which records `State at Handoff` and `Commit at Handoff` itself.
- **Personal records** (`user/{identity}/`) — `WORKING-MEMORY.md` and the personal inbox, stored under the person's
  identity and projected into each checkout. Edits persist with `arc save`.
- **Sync** — `arc sync` pulls state and publishes it, project and personal alike, beside the branch push.

---

[session-init]: ../workflows/arc/session-lifecycle/session-init.md
[session-handoff]: ../workflows/arc/session-lifecycle/session-handoff.md
