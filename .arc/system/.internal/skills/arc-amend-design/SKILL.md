---
name: arc-amend-design
description: "A specific finding or suspected gap in the design record or its derivation — a task that cannot complete as written, a stated outcome nothing produces, a decision that looks falsified: enter the gate, which decides whether it is an amendment. Do not patch inline or nest revision work under a verifier; specificity picks this door, never confidence."
disable-model-invocation: false
---

# ARC Amend Design

Ad-hoc door to [`amend-design`][amend-design] — the responsive procedure that decides what an implementation-time
finding changes in the design record and its derivation, records the change, places the corrective work, and closes
on the check that opened it. Entry presupposes a finding and commits to nothing: the first answer the gate returns
is usually that the design holds and only its derivation was incomplete.

The procedure's detection sites — the task loop's stops, terminal verification, a review finding — carry their own
directive lines into it from the stop already in hand. This door covers what none of them observes: a developer
saying mid-session that a task or a decision is wrong.

**When this door earns its use:**

- **A task that cannot complete as written.** What it asks for is unbuildable, contradicted by the code it lands
  in, or already satisfied elsewhere.
- **A stated outcome nothing produces.** A criterion, an exit criterion, or a design element covers a behavior the
  task list never realizes — modules built but unreachable, production callers left unwired.
- **A decision that looks falsified.** Evidence from the work suggests a settled decision is wrong rather than
  merely inconvenient.

**Which door — specificity, then chain link.** When you can point at the thing, this is the door, confirmed or not:
the gate is cheap, its first step returns "not an amendment", and a suspicion that does not pan out exits on
`design holds`. When you cannot point at it, the door is an audit, keyed by the chain link it examines — "is this
task still right" is `arc-task-audit`, "is this design still right" is `arc-design-audit`. Confidence never picks
the door. A verified finding from either audit enters here like any other evidence.

**Caller input:**

- **finding** — the specific observation, and where it was seen. Its counterpart is the design record: the artifact
  the active work unit's `meta-{name}.md` names in its `**Design:**` field. Resolve it from there when it is not
  already known in-session.

**Dispatch.** Run `.arc/system/workflows/arc/supplemental/amend-design.md` over the finding and that record, at the
stop you are already at. [`amend-design` § Entry gate][amend-design-gate] decides what kind of change the finding
is, or that it is none; where the answer changes a settled statement, the procedure's own stop carries the read to
the user before anything is written.

[amend-design]: ../../../workflows/arc/supplemental/amend-design.md
[amend-design-gate]: ../../../workflows/arc/supplemental/amend-design.md#entry-gate
