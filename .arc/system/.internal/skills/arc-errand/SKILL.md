---
name: arc-errand
description: Run an atomic, off-work-unit Errand from the current session, isolated from current work.
disable-model-invocation: false
---

# ARC Errand

The warm, in-session entrypoint for running an **errand** — a single out-of-work-unit concern handled
now, from the session you are already in. It is the counterpart to `arc-session --errand`, which starts
a *fresh* session for an errand: same lifecycle, different starting point. This skill assumes session
context is already established — it does **not** run session-init.

1. Confirm you are resolving an out-of-WU concern now.

   - The line is **now versus later**, not fix-versus-route. You invoke this to handle the concern now
     — because it is urgent, or because you already hold the commitment and context to place it
     directly (the express lane; `DEV-RULES.ARC § Discovered Work Routing`). **Deferring** it — parking
     it for a later drain to place — is `arc-inbox`; a current-WU concern is fixed **inline**, never an
     errand.
   - Resolving now has two shapes, both valid here:
       - **Execute the concern** — make the fix or change.
       - **Route the concern to its home** — write it directly into its destination (an existing
         backlog stub or draft) as the errand's change, rather than parking a thin inbox entry for a
         later session to re-derive.

2. Dispatch into the errand lifecycle.

   Run `.arc/system/workflows/arc/supplemental/run-errand.md`. Its Launch confirms errand-vs-Work-Unit
   (a multi-increment or design-bearing concern is a Work Unit — route it through `init-work-unit`
   instead), runs the advisory `arc errand check` overlap probe, and relocates the execution locus to an
   isolated base-derived branch — so the errand never executes on the branch you launched from. Execute
   and Integrate carry it to a landed commit.
