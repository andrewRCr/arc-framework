---
name: assess-start-readiness
description: Assess a named backlog target and frame a spawn-anchored launch.
override-active: false
---

# Method: assess-start-readiness

> - **Workflow:** [session-init][session-init]
> - **When:** The agenda names a resolved Start target
>
> - **Contract:** Report best-effort readiness, preserve launch interlocks, and hand off to the spawned checkout.

## assess-start-readiness.override

[No override configured]

## assess-start-readiness.default

Use the supplied `slug`, `metaPath`, and optional `taskListPath`, reusing the agenda's completed reads. Surface missing
or unreadable evidence. Resolve readiness on the strongest available basis: a recorded ready-attestation in the meta;
otherwise whether the task list is finalized; otherwise dependencies alone. State the basis and its limits.

**Tier 1 — deterministic, can gate.** Resolve each dependency by slug with `arc status <slug>`; never treat a
state-blind `Depends On` edge as satisfied. An unmet dependency blocks the green launch path. Where the target carries
a readiness baseline, check base-drift staleness against it as the second signal; without a baseline, that signal does
not apply. Report every failed signal and why it blocks readiness.

**Tier 2 — judgment, never gates.** Sanity-check the pick and offer a second opinion: a soft invitation with Tier 1
green, a recommendation when Tier 1 shows drift. Read the agenda's `concurrent-workload` note when present; do not
recompute the composition. This judgment adds advice, never a launch blocker.

Carry the readiness verdict and reasons into orientation. At the agenda's `launch` gate, ask:

> Launch `<slug>`? (spawn-anchored — `arc start`, then start a fresh session in the new worktree)

On approval:

1. Run `arc start <slug>`. Its commit and push interlocks and `Class` guard remain in force. A refusal or failed
   command stops the launch; surface its result before continuing.
2. Take the worktree path and branch from the successful result. Check the seeded mini-handoff at that checkout's
   `.arc/user/<identity>/<slug>/SESSION-NOTES.md`, using the resolved ARC identity and exact launched slug. Verify it
   names the target and carries its handoff commit and planning session context. If absent or incomplete, surface the
   gap rather than reporting a clean launch.
3. Hand off with the worktree path, slug and branch, and “open a fresh session there with your harness of choice.”
   Emit no harness-specific launch command.

Keep this session in its current checkout. If asked to continue in the new one, explain that the person's terminal
and editor stay in the current checkout while only the agent process moves, and recommend a fresh session. Move only
on explicit informed opt-in, then run session initialization afresh there.

---

[session-init]: ../workflows/arc/session-lifecycle/session-init.md
