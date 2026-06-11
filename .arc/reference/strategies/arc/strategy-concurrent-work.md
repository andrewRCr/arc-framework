# Strategy: Concurrent Work

Operational doctrine for running more than one work unit at a time. Covers when and why to parallelize, the
branch, rebase, and append-only discipline that keeps concurrent branches integrable and cross-machine-safe,
merge ordering between in-flight work units, worktree operations, managing work through awaiting-review latency,
and the conventions for shared state under concurrency.

These are **judgment-driven conventions, not enforced rules** — guidance for choosing and running concurrent
work well, applied with a light hand. They hold whenever more than one work unit is in flight, independent of
team mode and of the protection mode in use: a solo developer running two work units and a team running several
exercise the same mechanics.

**Sibling to [Team Coordination][team-coordination], not a subset of it.** The two cover orthogonal axes — team
coordination governs cross-identity collaboration (multiple people sharing the work); concurrent-work conventions
govern multi-work-unit mechanics, which apply per work unit whether the other in-flight work units are yours or a
teammate's. Both coexist and neither requires the other; the relationship is stated precisely in the dedicated
section below.

**Prerequisite:** [Work Organization Strategy][work-org] — branching model, work categories, protection modes,
and the `Integrating` state. This strategy layers concurrency conventions on that foundation.

---

## Worktrees by default

Running more than one work unit at a time means keeping more than one branch checked out at a time. ARC's default
mechanism for that is the **git worktree**: each in-flight work unit gets its own working directory, its own
checked-out branch, and its own `meta-{name}.md` and SESSION-NOTES. This departs from the long-standing
solo-developer norm of one clone and one branch with `git checkout` to switch between them — deliberately, and
primarily for the sake of agent isolation rather than developer convenience.

- **Isolation is the primary justification.** When a coding agent drives the work, a single shared working
  directory is a correctness hazard: an agent mid-task on one branch cannot safely switch to another without
  disturbing uncommitted state, build artifacts, and its own orientation. A worktree gives each work unit a
  stable, private directory that no concurrent session mutates underneath it. The per-work-unit `meta-{name}.md`
  and the worktree-local, gitignored SESSION-NOTES ride that isolation — each worktree carries exactly the
  context its work unit needs, and nothing from a sibling's.

- **Frictionless parallelism is the secondary benefit.** Worktrees also make moving between in-flight work units
  cheap: no stash dance, no rebuild from a fresh checkout, no losing your place. You move between directories
  rather than between branch states. For a person steering several work units this is convenience; for the
  isolation guarantee above it is structural.

### Discovery and cleanup discipline

Worktrees are cheap to create and therefore easy to accumulate. Two habits keep them from becoming clutter:

- **Sweep as you go.** A worktree exists to host an in-flight work unit. Once that work unit ships — merged and
  archived — its worktree has no further purpose; remove it (use `git worktree remove`, never `rm -rf`). Session
  initialization surfaces worktrees whose work units have already shipped as a between-sessions nudge; act on
  that surface rather than letting stale directories pile up.

- **Know which worktree you are in.** With several worktrees live, "which worktree am I in, and which work unit
  does it host?" becomes a genuine question. Session initialization names the occupied worktree and its work
  unit in its orientation, and the per-work-unit `meta-{name}.md` is the authoritative answer. Confirm the
  directory matches the work unit you intend to touch before acting in it — especially after switching context.

### Risks to manage

Two failure modes follow directly from worktrees being cheap:

- **Worktree accumulation** — directories created freely and removed reluctantly, until the list grows past the
  point where anyone can tell which are live. The sweep discipline above, reinforced by the stale-worktree
  surface at session start, is the counter.

- **"Which worktree am I in" confusion** — acting in the wrong directory, such as committing one work unit's
  change onto another's branch. Orient on the worktree and its `meta-{name}.md` at session start and before any
  cross-cutting action; never infer the current directory from memory across a context switch.

---

## Related Documentation

- [Team Coordination][team-coordination] — cross-identity collaboration; the orthogonal sibling to this strategy
- [Work Organization Strategy][work-org] — branching model, work categories, protection modes, archival

---

[team-coordination]: strategy-team-coordination.md
[work-org]: strategy-work-organization.md
