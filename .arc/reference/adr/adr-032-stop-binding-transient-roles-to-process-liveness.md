# ADR-032: Stop Binding Transient Roles to Process Liveness

## Status

Accepted

## Context

ARC's session locus model gave transient roles — Errands, grooming claims, housekeeping sweeps — a different
occupancy model from work-unit roles. A transient role was **session-bounded**, and that boundary was _proven_ by a
process anchor: a PID plus a process creation token, recorded with the role's lease and verified by reading the
platform's process table. A transient role found without a live lease was therefore classified as crash or
walk-away residue, and session initialization treated that residue as blocking — an unrelated session entering a
healthy work unit stopped until the residue was resolved.

**The asymmetry was reasoned, not arbitrary.** It followed from work character. A work unit is designed to span
sessions, so an idle work-unit role is normal. An Errand is atomic — one sitting — so an idle transient role means
something went wrong. Cross-session Errand work was meant to travel through an explicit pause, which is what made
"a remaining unleased transient role is still genuine residue" a sound inference from the model's own premises.

Three findings, in ascending order of force, showed the premise itself does not hold.

**Proportionality.** The mechanism exists to catch abandoned Errands, which occur roughly zero to two times a week.
In one observed day it blocked two unrelated sessions and caught none. An abandoned Errand is a branch with
uncommitted edits; left alone it costs nothing but the risk of being forgotten. That is a job for a list, not a
gate — the same treatment stale worktrees and orphan branches already receive as non-gating advisories.

**Failure direction.** When the check is wrong it is wrong toward `dead`, which is the one verdict that authorizes
reap and abandonment. Observed 2026-08-05: a live Errand held by a running session, carrying seven modified files,
was reported dead and offered for abandonment to an unrelated session.

**Portability — the decisive one.** A PID is meaningful only inside its own namespace and only to a reader
permitted to see the process table. ARC is agent-platform-agnostic and must run under sandboxed harnesses. A
sandboxed reader holds no evidence about another process, so the mechanism cannot be made reliable there by
sharpening it — there is nothing to sharpen. Demonstrated the same day: four independent reads of one record
returned `live`, while a sandboxed harness reading the identical record from the identical worktree returned
`dead`. The verdict depended on the caller's harness, not on the state.

A fourth finding removed the reason to keep the mechanism even where it works. Every transient identity record
already carries a durable three-valued state — `open`, `paused` (with a proven `savedHead`), and `awaiting-merge`
(with a recorded change request). Legitimate parking was therefore already distinguishable from abandonment by
reading the record, with no liveness check, no process anchor, and no harness dependency. The lease added only "is
a process attached at this instant," which is precisely the question a sandboxed reader cannot answer, and
precisely the question staleness answers well enough for a reminder.

**Alternatives considered.**

- **Sharpen harness recognition.** Rejected: recognition sharpness decides whether an anchor can be _selected_, not
  whether another process can be _observed_. It does not reach the portability finding.
- **Keep liveness, make residue non-gating.** Rejected as insufficient. It fixes the blocking symptom while leaving
  a verdict that is unreliable in the destructive direction, still consulted by paths that authorize removal.
- **Replace the PID anchor with an advisory file lock** held open by the session and released by the kernel on
  process exit — portable across namespaces. Rejected _for now_ as unneeded rather than unsound; recorded below so
  the option is not rediscovered from scratch.
- **Withdraw the premise (chosen).** Stop detecting session liveness for transients, and read abandonment from the
  record state that already carries it.

**What this reverses, and where it lives.** The decisions being reversed are in a shipped and archived work-unit
spec, not in a prior ADR — which is why this ADR exists rather than a supersession. The next person to meet the
lease fields needs this reasoning without reading a work-unit draft. The archived criteria are not edited; they
stand as the record of what was decided then, and this is the amendment forward.

## Decision

We will stop proving transient occupancy by process liveness.

- A **process anchor is no longer load-bearing** for whether a transient role is occupied. Transient roles remain
  session-bounded in _intent_; that boundary is simply no longer proven by inspecting the process table.
- An **unleased transient role is ordinary state**, not residue. It no longer gates session entry, and no session
  is blocked by another locus's transient role.
- **Abandonment is inferred from the identity record's own state**, plus staleness surfaced on the advisory tier
  alongside the existing worktree and branch sweeps — never gating, never authorizing removal on its own.
- **Age explains a prompt and never authorizes a reap.** This constraint is retained from the reversed model
  unchanged; nothing here weakens it.
- **Occupancy of the physical primary surfaces at contention**, where the allocator already reads it, rather than
  at session initialization. One asymmetry between transients and work units does survive — an Errand may occupy
  the scarce shared primary checkout, where an abandoned work-unit worktree is merely a directory — but contention
  is the moment that fact matters.

This governs every transient subject: Errands, grooming claims, and housekeeping sweeps.

## Consequences

### Positive

- **ARC works under sandboxed harnesses.** The one class of reader that could never answer the liveness question
  is no longer asked it.
- **A fault stays in the locus it belongs to.** No session is blocked at entry by a neighbour's transient role.
- **The dangerous direction stops authorizing destruction.** The verdict that was wrong toward `dead` no longer
  gates abandonment of transient work.
- **One authority instead of two.** The identity record already distinguished parking from abandonment; the lease
  was a second, weaker reader of the same fact.
- **Ceremony matches consequence.** A forgotten Errand becomes a reminder, which is what it always warranted.

### Negative

- **Automatic crash detection for Errands is gone.** A session that dies mid-Errand leaves a record that no longer
  announces itself as residue; it surfaces through staleness instead, on a slower and advisory path.
- **Two sessions may occupy one Errand** without the model preventing it.
- **The identity record becomes the sole authority** for whether a claim is parked or abandoned. The cross-machine
  transaction that keeps that record correct is consequently load-bearing in a way it was not before.

Both of the first two losses were previously prevented only _when the mechanism worked_, and neither is prevented
today under a sandboxed harness — so the loss is narrower than it first appears. It is real, and it is accepted
deliberately.

### Risks

- **The record transaction now carries more weight.** Its complete-basis reconciliation and refuse-on-unreadable
  posture were already correct; they now have less redundancy behind them and should not be relaxed.
- **Contention-time primary occupancy is named here and not yet built.** Until it is, the scarce-primary asymmetry
  is documented rather than enforced.
- **If liveness is ever wanted back**, the portable mechanism is an advisory file lock held open by the session and
  released by the kernel on process exit — meaningful across namespaces — not a recorded PID. Reaching for a
  process anchor again would re-acquire every finding above.

## Amending This Document
