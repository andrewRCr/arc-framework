---
name: arc-errand
description: Run an atomic, off-work-unit Errand from the current session, isolated from current work.
disable-model-invocation: false
arc:
  methods:
    - route-discovered-work
---

# ARC Errand

The warm, in-session entrypoint for running an **errand** — a single out-of-work-unit concern handled
now, from the session you are already in. It is the counterpart to `arc-session --errand`, which starts
a _fresh_ session for an errand: same lifecycle, different starting point. This skill assumes session
context is already established — it does **not** run session-init.

1. Confirm you are resolving an out-of-WU concern now.

   - The line is **now versus later**, not fix-versus-route. You invoke this to handle the concern now
     — because it is urgent, or because you already hold the commitment and context to place it
     directly (the express lane; `DEV-RULES.ARC § Discovered Work Routing`). **Deferring** it — parking
     it for a later drain to place — is `arc-inbox`; a current-WU concern is fixed **inline**, never an
     errand.
   - Resolving now has two shapes, both valid here:
       - **Execute the concern** — make the fix or change.
       - **Route the concern** — write an entry in a backlog stub or mint a stub as the route-only Errand's change,
         following the routing method's binding. Never write a started work unit's draft. The write follows
         `run-errand`'s pre-write re-check in the Errand's own checkout.

   Invoked directly for routing, run this gate before opening the Errand. A confirmed route-now hand-off from
   `arc-inbox` already ran it; continue with that result.

   **Method fire-point** · `route-discovered-work` — load `.arc/system/methods/route-discovered-work.md`:

   ```yaml
   route-discovered-work:
     entry: the concern to route, with any WU_Target and _Shapes_
     door: fast path
   ```

   > [!IMPORTANT]
   > `workflow-interlock`: Stop before opening the route-only Errand. Show the outcome, `_Shapes:_`, any unclear
   > pair with its four record answers, the coupled target's horizon advisory verbatim, and any named wait. For a
   > new stub, show the minting judgments. Await approval before dispatching the confirmed route.

   A result other than a now-route goes to `arc-inbox`'s step 1 hand-off with the confirmed outcome; do not run the
   gate again. A backlog-stub route continues below, subject to the method's writer line.

2. Dispatch into the errand lifecycle.

   Run `.arc/system/workflows/arc/supplemental/run-errand.md`. For a route-only Errand, Launch classifies the routing
   change — writing an entry or minting a stub — independently of the concern it carries. Its Launch confirms
   errand-vs-Work-Unit
   (a concern crossing either floor — a design worth recording, or a durable cross-session plan a correct
   execution must navigate — is a Work Unit; route it through `init-work-unit` instead), runs the advisory
   `arc errand check`, then consumes `arc errand open`'s exact primary/spawned checkout result. It never switches or
   repurposes a WU-owned checkout; partial protection uses only the free primary or refuses. Execute and Integrate
   carry the concern through leave/close/abandon as appropriate. When the Errand adopts a flagged `USER-INBOX §
   Errand` capture, `open --from-inbox` binds its origin so exact close drops the capture and abandonment retains it.
